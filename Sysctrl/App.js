/**
 * SysCtrl Mobile — Remote Interaction Matrix v5.3 (Production Build Fix)
 * Developer: Muhammad Ahmad
 */

import React, { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";
import {
  View, Text, TextInput, TouchableOpacity, TouchableHighlight,
  ScrollView, Modal, FlatList, StyleSheet, Animated, Easing,
  StatusBar, Alert, ActivityIndicator, PanResponder,
  Image, SafeAreaView, Vibration, Linking, AppState, Dimensions
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";

const THEMES = {
  cyber:     { id:"cyber",     name:"Cyber",       accent:"#00E5FF", accentSoft:"#00B8D4", bg:"#000000", surface:"#080808", card:"#0D0D0F", border:"#1A1A1A", text:"#FFFFFF", textMuted:"#555555", textDim:"#2A2A2A", danger:"#FF3B30", warning:"#FF9F0A", success:"#30FF80", g1:"#00E5FF", g2:"#2979FF", cardRadius:14, borderW:0.5 },
  cyberpunk: { id:"cyberpunk", name:"Cyberpunk",   accent:"#FF00FF", accentSoft:"#CC00CC", bg:"#0A0010", surface:"#110018", card:"#160020", border:"#2A0040", text:"#FF00FF", textMuted:"#660066", textDim:"#330033", danger:"#FF3300", warning:"#FFAA00", success:"#00FF66", g1:"#FF00FF", g2:"#00FFFF", cardRadius:0,  borderW:1   },
  batman:    { id:"batman",    name:"Batman",       accent:"#FFD700", accentSoft:"#C8A800", bg:"#050505", surface:"#0A0A0A", card:"#0F0F0F", border:"#1A1400", text:"#FFD700", textMuted:"#554400", textDim:"#2A2200", danger:"#FF2200", warning:"#FF8800", success:"#44FF00", g1:"#FFD700", g2:"#FF8800", cardRadius:4,  borderW:0.5 },
  gamer:     { id:"gamer",     name:"RGB Gamer",   accent:"#00FF41", accentSoft:"#00CC33", bg:"#000A00", surface:"#000F00", card:"#001500", border:"#003300", text:"#00FF41", textMuted:"#006600", textDim:"#003300", danger:"#FF0000", warning:"#FFFF00", success:"#00FF41", g1:"#00FF41", g2:"#00CCFF", cardRadius:6,  borderW:1   },
  minimal:   { id:"minimal",   name:"Minimal Dark",accent:"#FFFFFF", accentSoft:"#CCCCCC", bg:"#111111", surface:"#181818", card:"#1E1E1E", border:"#2A2A2A", text:"#FFFFFF", textMuted:"#777777", textDim:"#444444", danger:"#FF453A", warning:"#FFD60A", success:"#32D74B", g1:"#FFFFFF", g2:"#888888", cardRadius:8,  borderW:0.5 },
};

const ThemeContext = createContext(THEMES.cyber);
const useTheme = () => useContext(ThemeContext);

const DEFAULT_HTTP = 9997;
const DEFAULT_WS   = 9996;
const BOX_SIZE     = 260;

const haptic = (type = "light") => {
  const patterns = { light: [10], medium: [30], heavy: [50], success: [10, 50, 10] };
  Vibration.vibrate(patterns[type] || [10]);
};

async function fetchT(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(t);
    return r;
  } catch (e) { clearTimeout(t); throw e; }
}

function CircularGauge({ value = 0, label, color, size = 88 }) {
  const T = useTheme();
  const clr = color || T.g1;
  const av = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(av, { toValue: value, duration: 700, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: false }).start(); }, [value]);
  const half = size / 2;
  const r1 = av.interpolate({ inputRange: [0, 50, 100], outputRange: ["-90deg", "90deg", "90deg"], extrapolate: "clamp" });
  const r2 = av.interpolate({ inputRange: [0, 50, 100], outputRange: ["-90deg", "-90deg", "90deg"], extrapolate: "clamp" });
  const op = av.interpolate({ inputRange: [0, 49.9, 50], outputRange: [0, 0, 1], extrapolate: "clamp" });
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 5, borderColor: T.surface }} />
      <View style={{ position: "absolute", left: 0, top: 0, width: half, height: size, overflow: "hidden" }}>
        <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 5, borderColor: clr, borderRightColor: "transparent", borderBottomColor: "transparent", position: "absolute", transform: [{ rotate: r1 }] }} />
      </View>
      <Animated.View style={{ position: "absolute", left: half, top: 0, width: half, height: size, overflow: "hidden", opacity: op }}>
        <Animated.View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 5, borderColor: clr, borderLeftColor: "transparent", borderTopColor: "transparent", position: "absolute", left: -half, transform: [{ rotate: r2 }] }} />
      </Animated.View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: clr, letterSpacing: 0.5 }}>{Math.round(value)}%</Text>
        <Text style={{ fontSize: 9, color: T.textMuted, marginTop: 1, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</Text>
      </View>
    </View>
  );
}

function BatteryBar({ level = 0, plugged = false }) {
  const T = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(anim, { toValue: level, duration: 800, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: false }).start(); }, [level]);
  useEffect(() => {
    if (plugged) {
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.3, duration: 900, easing: Easing.linear, useNativeDriver: false }),
      ])).start();
    } else { glow.setValue(0); }
  }, [plugged]);
  const fillColor = anim.interpolate({ inputRange: [0, 20, 50, 100], outputRange: [T.danger, T.warning, T.g1, T.success] });
  const barW = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "88%"] });
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 160, height: 28, borderWidth: 1.5, borderColor: T.border, borderRadius: 5, overflow: "hidden", justifyContent: "center" }}>
        <Animated.View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: barW, backgroundColor: fillColor }} />
        {plugged && <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: fillColor, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }) }} />}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
        <Text style={{ color: T.textMuted, fontSize: 12, letterSpacing: 1 }}>{Math.round(level)}%</Text>
        {plugged && <Text style={{ color: T.accent, fontSize: 10, letterSpacing: 1.5, fontWeight: "700", marginLeft: 8 }}>⚡ CHARGING</Text>}
      </View>
    </View>
  );
}

function GlassCard({ children, style, onPress }) {
  const T = useTheme();
  const card = { backgroundColor: T.card, borderRadius: T.cardRadius, borderWidth: T.borderW, borderColor: T.border, padding: 16, marginBottom: 16 };
  if (onPress) return <TouchableHighlight onPress={onPress} underlayColor={T.surface} style={[card, style]}><View>{children}</View></TouchableHighlight>;
  return <View style={[card, style]}>{children}</View>;
}

function CmdButton({ label, icon, onPress, accent, danger, size="md", style, disabled }) {
  const T = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const border = danger ? T.danger : accent ? T.accent : T.border;
  const clr = danger ? T.danger : accent ? T.accent : T.textMuted;
  const h = size === "lg" ? 68 : 52;
  return (
    <Animated.View style={[{ transform:[{scale}] }, style, { flex: style?.flex !== undefined ? style.flex : 0 }]}>
      <TouchableHighlight
        onPress={() => { if (!disabled) { haptic("light"); onPress?.(); } }}
        onPressIn={() => Animated.spring(scale, { toValue:0.93, useNativeDriver:true, speed:50 }).start()} 
        onPressOut={() => Animated.spring(scale, { toValue:1, useNativeDriver:true, speed:20 }).start()}
        underlayColor={danger ? "#200000" : T.surface}
        disabled={disabled}
        style={{ borderRadius:T.cardRadius, borderWidth:T.borderW, borderColor:border, backgroundColor:T.surface, height:h, justifyContent:"center", alignItems:"center", width: '100%', opacity: disabled ? 0.5 : 1 }}
      >
        <View style={{ alignItems:"center", justifyContent:"center" }}>
          {icon && <Text style={{ fontSize: size==="lg"?22:16, marginBottom:4, color:clr }}>{icon}</Text>}
          <Text style={{ fontSize: size==="lg"?13:11, letterSpacing:1.5, fontWeight:"700", color:clr }}>{label}</Text>
        </View>
      </TouchableHighlight>
    </Animated.View>
  );
}

function DangerButton({ label, icon, onConfirm }) {
  const T = useTheme();
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  const onPress = () => {
    if (!armed) {
      setArmed(true); haptic("medium");
      timer.current = setTimeout(() => setArmed(false), 2500);
    } else {
      clearTimeout(timer.current); setArmed(false); haptic("heavy"); onConfirm?.();
    }
  };
  return (
    <TouchableHighlight onPress={onPress} underlayColor="#200000" style={{ flex:1, height:64, borderRadius:T.cardRadius, borderWidth:T.borderW, borderColor: armed ? T.danger : T.border, backgroundColor: armed ? "#1A0505" : T.surface, justifyContent:"center", alignItems:"center" }}>
      <View style={{ alignItems:"center" }}>
        <Text style={{ fontSize:18, marginBottom:4 }}>{armed ? "⚠️" : icon}</Text>
        <Text style={{ fontSize:10, color: armed ? T.danger : T.textMuted, letterSpacing:2, fontWeight:"700" }}>{armed ? `CONFIRM ${label}` : label}</Text>
      </View>
    </TouchableHighlight>
  );
}

function QRScannerModal({ visible, onClose, onPaired }) {
  const T = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  
  useEffect(() => {
    if (!visible) return;
    setScanned(false);
    if (!permission?.granted) requestPermission();
  }, [visible, permission]);

  const handleBarcodeScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const payload = JSON.parse(data);
      if (payload?.ip) {
        haptic("success"); Vibration.vibrate([10, 60, 10, 60, 30]);
        await AsyncStorage.setItem("sc_ip", payload.ip);
        if(payload.ws_port) await AsyncStorage.setItem("sc_ws_port", String(payload.ws_port));
        if(payload.http_port) await AsyncStorage.setItem("sc_http_port", String(payload.http_port));
        onPaired(payload); onClose();
      } else {
        Alert.alert("Invalid QR", "QR does not match SysCtrl desktop signature.", [{ text: "RETRY", onPress: () => setScanned(false) }]);
      }
    } catch (_) { Alert.alert("Parse Error", "QR payload is not valid JSON.", [{ text: "RETRY", onPress: () => setScanned(false) }]); }
  };
  
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:"#000000F0" }}>
        <SafeAreaView style={{ flex:1 }}>
          <View style={{ padding:24, flexDirection:"row", justifyContent:"space-between" }}>
            <Text style={{ color:T.accent, fontSize:14, fontWeight:"900", letterSpacing:4 }}>QR PAIR LINK</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color:T.textMuted, fontSize:10, letterSpacing:2, fontWeight:"700" }}>✕ CLOSE</Text></TouchableOpacity>
          </View>
          <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
            {permission === null ? <ActivityIndicator size="large" color={T.accent} /> : !permission.granted ? (
              <Text style={{ color:T.danger, fontSize:13, fontWeight:"700" }}>CAMERA ACCESS DENIED</Text>
            ) : (
              <View style={{ width:BOX_SIZE, height:BOX_SIZE, borderRadius:T.cardRadius, overflow:"hidden" }}>
                <CameraView style={{ width:BOX_SIZE, height:BOX_SIZE }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                {scanned && <View style={{ position:"absolute", top:0, left:0, right:0, bottom:0, backgroundColor:"#00000088", alignItems:"center", justifyContent:"center" }}><ActivityIndicator size="large" color={T.accent} /></View>}
              </View>
            )}
            {scanned && <TouchableOpacity onPress={() => setScanned(false)} style={{ marginTop:24, padding:12, borderWidth:T.borderW, borderColor:T.accent, borderRadius:8 }}><Text style={{ color:T.accent }}>↩ SCAN AGAIN</Text></TouchableOpacity>}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function DiscoveryModal({ visible, onClose, onSelect, httpPort }) {
  const T = useTheme();
  const [scanning, setScanning] = useState(false);
  const [results, setResults]   = useState([]);
  const [subnet, setSubnet]     = useState("192.168.1");
  const cancelRef = useRef(false);

  const scan = async () => {
    setScanning(true); setResults([]); cancelRef.current = false;
    const probes = Array.from({ length:254 }, (_, i) => `${subnet}.${i+1}`);
    const BATCH = 30;
    for (let i=0; i<probes.length; i+=BATCH) {
      if (cancelRef.current) break;
      await Promise.all(probes.slice(i, i+BATCH).map(async (host) => {
        if (cancelRef.current) return;
        try {
          const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 1200);
          const r = await fetch(`http://${host}:${httpPort}/ping`, { signal:ctrl.signal });
          if (r.ok) { const d = await r.json(); if (!cancelRef.current) setResults(p => [...p, { ip:host, hostname:d.hostname||host }]); }
        } catch (_) {}
      }));
    }
    if (!cancelRef.current) setScanning(false);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:"#000000CC", justifyContent:"flex-end" }}>
        <View style={{ backgroundColor:T.surface, borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:T.borderW, borderColor:T.border, padding:20, paddingBottom:36 }}>
          <View style={{ width:40, height:4, backgroundColor:T.border, borderRadius:2, alignSelf:"center", marginBottom:20 }} />
          <Text style={{ color:T.accent, fontSize:13, fontWeight:"900", letterSpacing:4, marginBottom:4 }}>AUTOMATED AGENT SCAN</Text>
          <View style={{ flexDirection:"row", alignItems:"center", marginBottom:12, backgroundColor:T.card, borderRadius:8, borderWidth:T.borderW, borderColor:T.border, padding:10 }}>
            <Text style={{ color:T.textMuted, fontSize:9, letterSpacing:2, marginRight:10 }}>SUBNET RANGE</Text>
            <TextInput style={{ flex:1, color:T.accent, fontSize:15, fontWeight:"600", padding:0 }} value={subnet} onChangeText={setSubnet} keyboardType="numeric" />
          </View>
          <TouchableHighlight onPress={scanning ? () => { cancelRef.current=true; setScanning(false); } : scan} style={{ backgroundColor:T.card, borderRadius:10, borderWidth:T.borderW, borderColor:scanning?T.danger:T.accent, padding:14, alignItems:"center", marginBottom:14 }}>
            <Text style={{ color:scanning?T.danger:T.accent, fontSize:12, fontWeight:"700", letterSpacing:2 }}>{scanning ? "⏹ ABORT SCAN" : "📡 RUN SCAN"}</Text>
          </TouchableHighlight>
          <FlatList data={results} keyExtractor={i=>i.ip} renderItem={({item}) => (
            <TouchableHighlight onPress={() => { onSelect(item.ip); onClose(); }} style={{ borderRadius:8, marginBottom:6, borderWidth:T.borderW, borderColor:T.border, backgroundColor:T.card }}>
              <View style={{ flexDirection:"row", alignItems:"center", padding:12 }}><Text style={{ color:T.accent, fontSize:14, fontWeight:"700" }}>{item.ip} — {item.hostname}</Text></View>
            </TouchableHighlight>
          )} />
          <TouchableOpacity onPress={onClose} style={{ marginTop:6, alignItems:"center", padding:12 }}><Text style={{ color:T.textMuted, fontSize:10, letterSpacing:3 }}>CLOSE</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function AppLauncherModal({ visible, onClose, ip, httpPort, send }) {
  const T = useTheme();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { if (visible) load(); }, [visible]);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchT(`http://${ip}:${httpPort}/apps`, {}, 10000);
      const d = await r.json();
      setApps(d.apps || []);
    } catch (e) { Alert.alert("Query Failed", e.message); }
    setLoading(false);
  };
  const filtered = apps.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:"#000000CC", justifyContent:"flex-end" }}>
        <View style={{ backgroundColor:T.surface, borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:T.borderW, borderColor:T.border, padding:20, paddingBottom:36, maxHeight:"92%" }}>
          <View style={{ width:40, height:4, backgroundColor:T.border, borderRadius:2, alignSelf:"center", marginBottom:16 }} />
          <TextInput style={{ color:T.accent, fontSize:14, backgroundColor:T.card, borderRadius:8, borderWidth:T.borderW, borderColor:T.border, padding:10, marginBottom:12 }} value={search} onChangeText={setSearch} placeholder="Filter application shortcuts..." placeholderTextColor={T.textDim} />
          {loading ? <ActivityIndicator color={T.accent} style={{ marginVertical:30 }} /> : (
            <FlatList data={filtered} keyExtractor={i=>i.name} style={{ maxHeight:380 }} renderItem={({item}) => (
              <View style={{ flexDirection:"row", alignItems:"center", paddingVertical:10, borderBottomWidth:0.5, borderColor:T.border }}>
                <Text style={{ color:T.text, fontSize:13, flex:1 }} numberOfLines={1}>{item.name}</Text>
                <TouchableHighlight onPress={() => { haptic("light"); send({ action:"launch", value:item.exe }); onClose(); }} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:6, borderWidth:T.borderW, borderColor:T.accent+"44" }}>
                  <Text style={{ color:T.accent, fontSize:10 }}>LAUNCH</Text>
                </TouchableHighlight>
              </View>
            )} />
          )}
          <TouchableOpacity onPress={onClose} style={{ marginTop:12, alignItems:"center", padding:12 }}><Text style={{ color:T.textMuted, fontSize:10, letterSpacing:3 }}>CLOSE</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ThemeModal({ visible, onClose, currentTheme, onSelect }) {
  const T = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:"#000000CC", justifyContent:"flex-end" }}>
        <View style={{ backgroundColor:T.surface, borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:T.borderW, borderColor:T.border, padding:20, paddingBottom:36 }}>
          <View style={{ width:40, height:4, backgroundColor:T.border, borderRadius:2, alignSelf:"center", marginBottom:16 }} />
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {Object.values(THEMES).map(th => (
              <TouchableHighlight key={th.id} onPress={() => { haptic("light"); onSelect(th.id); onClose(); }} style={{ padding:12, borderRadius:th.cardRadius||10, borderWidth:currentTheme===th.id?2:0.5, borderColor:currentTheme===th.id?th.accent:T.border, backgroundColor:th.card, minWidth:90, alignItems:"center" }}>
                <Text style={{ color:th.accent, fontSize:10, fontWeight:"700" }}>{th.name}</Text>
              </TouchableHighlight>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} style={{ marginTop:16, alignItems:"center", padding:12 }}><Text style={{ color:T.textMuted, fontSize:10, letterSpacing:3 }}>CLOSE</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function TouchpadScreen({ send, sensitivity, onSensitivityChange }) {
  const T = useTheme();
  const lastPos = useRef(null);
  const scrollMode = useRef(false);
  const lastTap = useRef(0);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      lastPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      scrollMode.current = false;
      const now = Date.now();
      if (now - lastTap.current < 280) { haptic("medium"); send({ action: "mouse_click", button: "left", double: true }); }
      lastTap.current = now;
    },
    onPanResponderMove: (e, g) => {
      if (!lastPos.current) return;
      const dx = e.nativeEvent.pageX - lastPos.current.x;
      const dy = e.nativeEvent.pageY - lastPos.current.y;
      lastPos.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      if (scrollMode.current) {
        if (Math.abs(dy) > 2) send({ action:"mouse_scroll", direction: dy > 0 ? "down" : "up", amount: 2 });
      } else {
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) send({ action:"mouse_move", dx, dy, sensitivity: sensitivity });
      }
    },
    onPanResponderRelease: () => { lastPos.current = null; },
  });
  return (
    <View style={{ flex:1 }}>
      <GlassCard style={{ paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: T.textDim, fontSize: 9, letterSpacing: 2, fontWeight: "700" }}>SENSITIVITY: {sensitivity.toFixed(1)}x</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => onSensitivityChange(Math.max(0.5, sensitivity - 0.5))} style={{ padding: 4, backgroundColor: T.surface, borderRadius: 4, borderWidth: T.borderW, borderColor: T.border }}><Text style={{ color: T.text, fontSize: 12 }}> - </Text></TouchableOpacity>
            <TouchableOpacity onPress={() => onSensitivityChange(Math.min(4.0, sensitivity + 0.5))} style={{ padding: 4, backgroundColor: T.surface, borderRadius: 4, borderWidth: T.borderW, borderColor: T.border }}><Text style={{ color: T.text, fontSize: 12 }}> + </Text></TouchableOpacity>
          </View>
        </View>
      </GlassCard>
      <View style={{ flexDirection:"row", gap:8, marginBottom:10 }}>
        <CmdButton label="SCROLL" icon="↕️" style={{flex:1}} onPress={() => { scrollMode.current = !scrollMode.current; haptic("light"); }} />
        <CmdButton label="LEFT CLICK"  icon="🖱️" accent style={{flex:1}} onPress={() => send({ action:"mouse_click", button:"left" })} />
        <CmdButton label="RIGHT CLICK" icon="🖱️" style={{flex:1}} onPress={() => send({ action:"mouse_click", button:"right" })} />
      </View>
      <View {...panResponder.panHandlers} style={{ flex:1, backgroundColor: T.surface, borderRadius: T.cardRadius, borderWidth: T.borderW, borderColor: T.border, alignItems:"center", justifyContent:"center", minHeight:260 }}>
        <Text style={{ color: T.textDim, fontSize:12, letterSpacing:2 }}>DRAG TO MOVE · DOUBLE TAP TO OPEN</Text>
      </View>
      <View style={{ flexDirection:"row", gap:8, marginTop:10 }}>
        <CmdButton label="DOUBLE CLICK" icon="👆" style={{flex:1}} onPress={() => send({ action:"mouse_click", button:"left", double:true })} />
        <CmdButton label="SCROLL ↑" style={{flex:1}} onPress={() => send({ action:"mouse_scroll", direction:"up", amount:5 })} />
        <CmdButton label="SCROLL ↓" style={{flex:1}} onPress={() => send({ action:"mouse_scroll", direction:"down", amount:5 })} />
      </View>
    </View>
  );
}

function KeyboardScreen({ send }) {
  const T = useTheme();
  const [text, setText] = useState("");
  const [ctrlActive, setCtrlActive]   = useState(false);
  const [altActive, setAltActive]     = useState(false);
  const [winActive, setWinActive]     = useState(false);
  const [shiftActive, setShiftActive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [keyCooldown, setKeyCooldown] = useState(false);

  const handleType = async () => {
    if (isTyping || !text) return;
    setIsTyping(true); haptic("light");
    await send({ action: "type", value: text });
    setText(""); setTimeout(() => setIsTyping(false), 500); 
  };
  const handleKeyInteraction = async (key) => {
    if (keyCooldown) return;
    setKeyCooldown(true); haptic("light");
    let modifiers = [];
    if (ctrlActive)  modifiers.push("ctrl");
    if (altActive)   modifiers.push("alt");
    if (winActive)   modifiers.push("win");
    if (shiftActive) modifiers.push("shift");
    const finalValue = modifiers.length > 0 ? modifiers.join("+") + "+" + key : key;
    if (modifiers.length > 0) { setCtrlActive(false); setAltActive(false); setWinActive(false); setShiftActive(false); }
    await send({ action: "key", value: finalValue });
    setTimeout(() => setKeyCooldown(false), 100);
  };
  const PC_KEYBOARD_ROWS = [
    ["esc", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m", "comma", "period", "backspace", "enter"]
  ];
  const getKeyColor = (k) => {
    if (k === "backspace") return T.danger;
    if (k === "enter") return T.success;
    if (k.startsWith("f") || k === "esc") return T.warning;
    return T.text;
  };
  return (
    <ScrollView style={{ flex:1 }} showsVerticalScrollIndicator={false}>
      <GlassCard>
        <Text style={{ color:T.textMuted, fontSize:9, letterSpacing:2, marginBottom:8 }}>RAW STRING & EMOJI INPUT</Text>
        <View style={{ flexDirection:"row", gap:8 }}>
          <TextInput style={{ flex:1, color:T.accent, fontSize:15, backgroundColor:T.surface, borderRadius:8, borderWidth:T.borderW, borderColor:T.border, padding:10 }} value={text} onChangeText={setText} placeholder="Type text, code, or emojis... 🚀" placeholderTextColor={T.textDim} />
          <CmdButton label={isTyping ? "WAIT" : "TYPE"} accent style={{width:64}} disabled={isTyping} onPress={handleType} />
        </View>
      </GlassCard>

      <Text style={{ color:T.textDim, fontSize:9, letterSpacing:2, marginBottom:8, fontWeight:"700" }}>OS MACROS</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <CmdButton label="ALT+TAB" icon="🔄" style={{flex:1}} onPress={() => send({ action: "key", value: "alt+tab" })} />
        <CmdButton label="WIN+TAB" icon="🗂️" style={{flex:1}} onPress={() => send({ action: "key", value: "win+tab" })} />
        <CmdButton label="DESKTOP" icon="🖥️" style={{flex:1}} onPress={() => send({ action: "key", value: "win+d" })} />
      </View>

      <Text style={{ color:T.textDim, fontSize:9, letterSpacing:2, marginBottom:8, fontWeight:"700" }}>STICKY HARDWARE MODIFIERS</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
        {[["CTRL",ctrlActive,setCtrlActive],["ALT",altActive,setAltActive],["WIN",winActive,setWinActive],["SHIFT",shiftActive,setShiftActive]].map(([lbl,active,set]) => (
          <TouchableOpacity key={lbl} onPress={() => set(!active)} style={[{ flex: 1, height: 38, borderRadius: 6, borderWidth: 0.5, justifyContent: "center", alignItems: "center" }, { backgroundColor: active ? T.accent : T.card, borderColor: T.border }]}>
            <Text style={{ color: active ? T.bg : T.text, fontWeight:"900", fontSize:11 }}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color:T.textDim, fontSize:9, letterSpacing:2, marginBottom:8, fontWeight:"700" }}>ALPHABETIC INPUT MATRIX</Text>
      {PC_KEYBOARD_ROWS.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: 4, marginBottom: 6, justifyContent: "center", width: "100%" }}>
          {row.map(k => (
            <TouchableOpacity key={k} onPress={() => handleKeyInteraction(k === "comma" ? "," : k === "period" ? "." : k)} style={[{ height: 36, borderRadius: 6, borderWidth: 0.5, flex: 1, justifyContent: "center", alignItems: "center" }, { backgroundColor:T.card, borderColor:T.border, flex:k=="backspace"||k=="enter"?1.5:1 }]}>
              <Text style={{ color: getKeyColor(k), fontWeight:"700", fontSize: ri===0?8:9 }}>{k === "comma" ? "," : k === "period" ? "." : k.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={{ flexDirection:"row", gap:6, marginTop:6, alignItems:"center" }}>
        {[["space","SPACE",T.accent,5],["tab","TAB",T.text,1.5]].map(([k,lbl,clr,flex]) => (
          <TouchableOpacity key={k} onPress={() => handleKeyInteraction(k)} style={[{ height: 36, borderRadius: 6, borderWidth: 0.5, justifyContent: "center", alignItems: "center" },{backgroundColor:T.card,borderColor:T.border,height:40,flex}]}><Text style={{ color:clr, fontWeight:"700" }}>{lbl}</Text></TouchableOpacity>
        ))}
      </View>
      <View style={{ alignItems:"center", marginVertical:14 }}>
        <View style={{ width:120, height:80, position:"relative" }}>
          {[["up","▲",{top:0,left:40}],["left","◀",{bottom:0,left:0}],["down","▼",{bottom:0,left:40}],["right","▶",{bottom:0,right:0}]].map(([k,sym,pos]) => (
            <TouchableOpacity key={k} onPress={() => handleKeyInteraction(k)} style={[{ width: 38, height: 38, borderRadius: 6, borderWidth: 0.5, justifyContent: "center", alignItems: "center" },{position:"absolute",backgroundColor:T.card,borderColor:T.border,...pos}]}><Text style={{ color:T.accent }}>{sym}</Text></TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function MediaScreen({ send, media }) {
  const T = useTheme();
  return (
    <View style={{ flex:1 }}>
      <GlassCard>
        <Text style={{ color:T.textDim, fontSize:9, letterSpacing:2, marginBottom:6 }}>NOW PLAYING</Text>
        <Text style={{ color:T.accent, fontSize:16, fontWeight:"700", letterSpacing:0.5 }} numberOfLines={1}>{media?.title || "—"}</Text>
        <Text style={{ color:T.textMuted, fontSize:12, marginTop:4 }} numberOfLines={1}>{media?.artist || "No active audio tracks detected"}</Text>
        <View style={{ flexDirection:"row", alignItems:"center", marginTop:12 }}>
          <View style={{ width:8, height:8, borderRadius:4, backgroundColor: media?.status === "Playing" ? T.success : T.textDim, marginRight:8 }} />
          <Text style={{ color: media?.status === "Playing" ? T.success : T.textMuted, fontSize:10, letterSpacing:2 }}>{media?.status ? media.status.toUpperCase() : "STOPPED"}</Text>
        </View>
      </GlassCard>
      <GlassCard>
        <Text style={{ color:T.textDim, fontSize:9, letterSpacing:2, marginBottom:8, fontWeight:"700" }}>SYSTEM VOLUME</Text>
        <View style={{ flexDirection:"row", gap:8, marginBottom:16 }}>
          <CmdButton label="VOL ▼" icon="🔉" style={{flex:1}} onPress={() => send({ action:"media", value:"vol_down" })} />
          <CmdButton label="MUTE" icon="🔇" danger style={{flex:1}} onPress={() => send({ action:"media", value:"mute" })} />
          <CmdButton label="VOL ▲" icon="🔊" style={{flex:1}} onPress={() => send({ action:"media", value:"vol_up" })} />
        </View>
        <Text style={{ color:T.textDim, fontSize:9, letterSpacing:2, marginBottom:8, fontWeight:"700" }}>PLAYBACK CONTROLS</Text>
        <View style={{ flexDirection:"row", gap:8 }}>
          <CmdButton label="⏮" size="lg" style={{flex:1}} onPress={() => send({ action:"media", value:"prev" })} />
          <CmdButton label="⏯" size="lg" accent style={{flex:2}} onPress={() => send({ action:"media", value:"play_pause" })} />
          <CmdButton label="⏭" size="lg" style={{flex:1}} onPress={() => send({ action:"media", value:"next" })} />
        </View>
      </GlassCard>
    </View>
  );
}

function SystemScreen({ send }) {
  const T = useTheme();
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [screenshotData, setScreenshotData] = useState(null);
  const [scLoading, setScLoading] = useState(false);
  
  const triggerScreenshotFetch = async () => {
    if (scLoading) return;
    setScLoading(true); setShowScreenshot(true);
    setScreenshotData(null);
    try {
      const res = await send({ action: "screenshot" });
      if (res?.image) setScreenshotData(res.image);
      else { Alert.alert("Capture Fault", "No image data received."); setShowScreenshot(false); }
    } catch (e) { Alert.alert("Capture Fault", e.message); setShowScreenshot(false); }
    setScLoading(false);
  };

  return (
    <View style={{ flex:1 }}>
      <Text style={{ color:T.textDim, fontSize:9, letterSpacing:3, marginBottom:8, fontWeight:"700" }}>POWER ENVIRONMENT</Text>
      <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
        <DangerButton label="SHUTDOWN" icon="⏻" onConfirm={() => send({ action:"system", value:"shutdown" })} />
        <View style={{width:8}}/>
        <DangerButton label="RESTART"  icon="↺" onConfirm={() => send({ action:"system", value:"restart" })} />
      </View>
      <View style={{ flexDirection:"row", gap:8, marginBottom:16 }}>
        <CmdButton label="SLEEP" icon="💤" style={{flex:1}} onPress={() => send({ action:"system", value:"sleep" })} />
        <CmdButton label="LOCK CORE" icon="🔒" accent style={{flex:1}} onPress={() => send({ action:"system", value:"lock" })} />
      </View>
      <GlassCard><View style={{ flexDirection:"row", gap:8 }}><CmdButton label="📸 FULL SCREEN CAPTURE" accent style={{flex:1}} onPress={triggerScreenshotFetch} /></View></GlassCard>
      
      <Modal visible={showScreenshot} transparent animationType="fade" onRequestClose={() => setShowScreenshot(false)}>
        <View style={{ flex:1, backgroundColor:"#000000", justifyContent:"center", alignItems:"center" }}>
          {scLoading ? (
            <View style={{ alignItems: 'center' }}><ActivityIndicator size="large" color={T.accent} /><Text style={{ color:T.accent, fontSize:10, letterSpacing:3, marginTop:16 }}>CAPTURING DISPLAY MATRIX...</Text></View>
          ) : screenshotData ? (
            <>
              <Image source={{ uri:`data:image/jpeg;base64,${screenshotData}` }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height, resizeMode: "contain" }} />
              <TouchableOpacity onPress={() => { setShowScreenshot(false); setScreenshotData(null); }} style={{ position: "absolute", bottom: 40, alignSelf: "center", backgroundColor: T.surface, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: T.accent }}><Text style={{ color: T.text, fontWeight: "900", letterSpacing: 2 }}>✕ CLOSE VIEW</Text></TouchableOpacity>
            </>
          ) : (<TouchableOpacity onPress={() => setShowScreenshot(false)} style={{ padding: 20 }}><Text style={{ color:T.textMuted }}>No Display Stream Registered. Tap to close.</Text></TouchableOpacity>)}
        </View>
      </Modal>
    </View>
  );
}

const TABS = [
  { id:"dashboard", label:"DASH",  icon:"📊" },
  { id:"media",     label:"MEDIA", icon:"🎵" },
  { id:"touchpad",  label:"PAD",   icon:"🖱️" },
  { id:"keyboard",  label:"KEYS",  icon:"⌨️" },
  { id:"system",    label:"SYS",   icon:"⚙️" },
];

export default function App() {
  const [themeId, setThemeId]           = useState("cyber");
  const [activeTab, setActiveTab]       = useState("dashboard");
  
  // CRITICAL SYNCHRONIZATION UPGRADE: Clear initial static subnets to let the device storage populate first safely
  const [ip, setIpRaw]                  = useState(""); 
  const [httpPort, setHttpPort]         = useState(DEFAULT_HTTP);
  const [wsPort, setWsPort]             = useState(DEFAULT_WS);
  
  const [isReady, setIsReady]           = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [connected, setConnected]       = useState(false);
  const [taskbarCount, setTaskbarCount] = useState(0);
  const [telemetry, setTelemetry]       = useState({ cpu:0, ram:0, battery:100, plugged:false, disk_percent:0, windows: [] });
  const [media, setMedia]               = useState({ title:"", artist:"", status:"Stopped" });
  const [touchpadSensitivity, setTouchpadSensitivity] = useState(1.5);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showApps, setShowApps]           = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  
  const wsRef        = useRef(null);
  const reconnectRef = useRef(null);
  const connectedRef = useRef(false);
  const pendingRef   = useRef({});
  const msgIdRef     = useRef(0);
  const appState     = useRef(AppState.currentState);

  const T = THEMES[themeId] || THEMES.cyber;

  // CRITICAL ENGINE REFACTOR: Reads variables exactly ONCE on boot, breaking the legacy re-render infinite loop
  useEffect(() => {
    const hydrateStorage = async () => {
      try {
        const savedIp = await AsyncStorage.getItem("sc_ip");
        const savedTheme = await AsyncStorage.getItem("sc_theme");
        const savedWsPort = await AsyncStorage.getItem("sc_ws_port");
        const savedHttpPort = await AsyncStorage.getItem("sc_http_port");
        const savedSens = await AsyncStorage.getItem("sc_sensitivity");

        if (savedIp) setIpRaw(savedIp);
        if (savedTheme) setThemeId(savedTheme);
        if (savedWsPort) setWsPort(Number(savedWsPort));
        if (savedHttpPort) setHttpPort(Number(savedHttpPort));
        if (savedSens) setTouchpadSensitivity(parseFloat(savedSens));
      } catch (err) {
        console.error("Storage loading failed", err);
      } finally {
        setIsReady(true);
      }
    };

    hydrateStorage();

    const subscription = AppState.addEventListener("change", nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        if (!connectedRef.current) setReconnectTrigger(p => p + 1);
      }
      appState.current = nextAppState;
    });
    return () => { subscription.remove(); clearTimeout(reconnectRef.current); };
  }, []);

  const setIp = async (v) => { setIpRaw(v); await AsyncStorage.setItem("sc_ip", v); };
  const selectTheme = async (id) => { setThemeId(id); await AsyncStorage.setItem("sc_theme", id); };
  const updateSensitivity = async (val) => { setTouchpadSensitivity(val); await AsyncStorage.setItem("sc_sensitivity", String(val)); };

  const handleQRPaired = useCallback(({ ip: newIp, ws_port, http_port }) => {
    if (!newIp) return;
    setIpRaw(newIp); 
    if(ws_port) setWsPort(Number(ws_port)); 
    if(http_port) setHttpPort(Number(http_port)); 
  }, []);

  const connectWsWithParams = useCallback((targetIp, targetWsPort) => {
    if (!targetIp || !targetWsPort) return;
    if (wsRef.current) { try { wsRef.current.close(); } catch(_) {} wsRef.current = null; }

    try {
      const ws = new WebSocket(`ws://${targetIp.trim()}:${targetWsPort}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true); connectedRef.current = true;
        ws.pingInterval = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" })); }, 5000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg._id !== undefined && pendingRef.current[msg._id]) {
            pendingRef.current[msg._id](msg);
            delete pendingRef.current[msg._id];
            return;
          }
          if (msg.type === "telemetry") {
            setTelemetry(prev => ({ ...prev, cpu:msg.cpu??0, ram:msg.ram??0, battery:msg.battery??100, plugged:msg.plugged??false, disk_percent:msg.disk_percent??0, windows: msg.windows??[] }));
            if (msg.taskbar_apps_count !== undefined) setTaskbarCount(msg.taskbar_apps_count);
            if (msg.media) setMedia(msg.media);
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        clearInterval(ws.pingInterval);
        setConnected(false); connectedRef.current = false;
        clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => connectWsWithParams(targetIp, targetWsPort), 3000);
      };
      
      ws.onerror = () => { 
        setConnected(false); connectedRef.current = false; 
        try { ws.close(); } catch(_) {} // Forces loop conversion cleanly
      };
    } catch (err) {}
  }, []);

  // Isolated execution trigger for socket handshakes
  useEffect(() => { 
    if (isReady && ip && wsPort) {
      connectWsWithParams(ip, wsPort); 
    }
    return () => clearTimeout(reconnectRef.current); 
  }, [isReady, ip, wsPort, reconnectTrigger]);

  const send = useCallback(async (payload) => {
    const ws = wsRef.current;
    if (ws?.readyState === 1) {
      if (payload.action === "screenshot" || payload.action === "clipboard_get") {
        return new Promise((resolve) => {
          const id = ++msgIdRef.current;
          const timeout = setTimeout(() => { delete pendingRef.current[id]; resolve({ error: "Timeout" }); }, 15000);
          pendingRef.current[id] = (msg) => { clearTimeout(timeout); resolve(msg); };
          ws.send(JSON.stringify({ ...payload, _id: id }));
        });
      }
      ws.send(JSON.stringify(payload)); return { ok: true };
    }
    return { ok: false };
  }, []);

  const openExternalLink = (target) => {
    haptic("medium");
    const urls = { git: "https://github.com/hahmadar007-cmd", link: "https://www.linkedin.com/in/muhammad-ahmad-3387a7382/" };
    Linking.openURL(urls[target]).catch(() => {});
  };

  const handleWindow = (hwnd, type) => { haptic("light"); send({ action: "window_action", hwnd, type }); };

  const renderDashboard = () => (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16 }} showsVerticalScrollIndicator={false}>
      <GlassCard style={{ alignItems:"center", paddingVertical:12 }}>
        <Text style={{ color:T.textMuted, fontSize:10, letterSpacing:2, fontWeight:"700" }}>DESKTOP WORKSPACE STATUS</Text>
        <Text style={{ color:T.accent, fontSize:26, fontWeight:"900", marginTop:4 }}>{taskbarCount}</Text>
        <Text style={{ color:T.textDim, fontSize:8, letterSpacing:1, marginTop:2 }}>RUNNING WINDOWS</Text>
      </GlassCard>

      {telemetry.windows && telemetry.windows.length > 0 && (
        <GlassCard>
          <Text style={{ color:T.textDim, fontSize:10, letterSpacing:2, marginBottom:10, fontWeight:"700" }}>ACTIVE PROCESS MATRIX</Text>
          <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled={true} showsVerticalScrollIndicator={false}>
            {telemetry.windows.map((w, i) => (
              <View key={i} style={{ backgroundColor: T.surface, padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: T.border }}>
                <Text style={{ color:T.text, fontSize:12, fontWeight:"600", marginBottom: 10 }} numberOfLines={1}>{w.title}</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity onPress={() => handleWindow(w.hwnd, 'focus')} style={{ flex: 1.5, backgroundColor: T.accent+"22", padding: 8, borderRadius: 6, alignItems: "center" }}><Text style={{ color: T.accent, fontSize: 10, fontWeight: "700" }}>FOCUS</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleWindow(w.hwnd, 'minimize')} style={{ flex: 1, backgroundColor: T.card, padding: 8, borderRadius: 6, alignItems: "center", borderWidth: 1, borderColor: T.border }}><Text style={{ color: T.textMuted, fontSize: 10 }}>MIN</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleWindow(w.hwnd, 'maximize')} style={{ flex: 1, backgroundColor: T.card, padding: 8, borderRadius: 6, alignItems: "center", borderWidth: 1, borderColor: T.border }}><Text style={{ color: T.textMuted, fontSize: 10 }}>MAX</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleWindow(w.hwnd, 'close')} style={{ flex: 1, backgroundColor: T.danger+"22", padding: 8, borderRadius: 6, alignItems: "center" }}><Text style={{ color: T.danger, fontSize: 10, fontWeight: "700" }}>CLOSE</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </GlassCard>
      )}

      <Text style={{ color:T.textDim, fontSize:9, letterSpacing:3, marginBottom:8, fontWeight:"700" }}>HARDWARE TELEMETRY</Text>
      <GlassCard>
        <View style={{ flexDirection:"row", justifyContent:"space-around", paddingVertical:8 }}>
          <CircularGauge value={telemetry.cpu}  label="CPU"  color={T.g1} size={90} />
          <View style={{ width:0.5, height:60, backgroundColor:T.border, alignSelf:"center" }} />
          <CircularGauge value={telemetry.ram}  label="RAM"  color={T.g2} size={90} />
          <View style={{ width:0.5, height:60, backgroundColor:T.border, alignSelf:"center" }} />
          <CircularGauge value={telemetry.disk_percent} label="DISK" color={T.accentSoft} size={90} />
        </View>
        <View style={{ marginTop:16, paddingTop:14, borderTopWidth:0.5, borderColor:T.border, alignItems:"center" }}>
          <BatteryBar level={telemetry.battery} plugged={telemetry.plugged} />
        </View>
      </GlassCard>
      
      <GlassCard>
        <View style={{ flexDirection:"row", gap:8 }}>
          <CmdButton label="APP INDEX"  icon="📦" style={{flex:1}} onPress={() => setShowApps(true)} />
          <CmdButton label="SLEEP NODE" icon="💤" style={{flex:1}} onPress={() => send({ action:"system", value:"sleep" })} />
          <CmdButton label="LOCK CORE"  icon="🔒" accent style={{flex:1}} onPress={() => send({ action:"system", value:"lock" })} />
        </View>
      </GlassCard>

      <GlassCard style={{ alignItems:"center", paddingVertical:10 }}>
        <Text style={{ color:T.textDim, fontSize:8, letterSpacing:2, marginBottom:4 }}>DEVELOPED BY</Text>
        <Text style={{ color:T.accent, fontSize:11, fontWeight:"900", letterSpacing:2 }}>MUHAMMAD AHMAD</Text>
        <View style={{ flexDirection:"row", gap:16, marginTop:8 }}>
          <TouchableOpacity onPress={() => openExternalLink("link")}><Text style={{ color:T.textMuted, fontSize:8, letterSpacing:1 }}>🔗 LinkedIn</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => openExternalLink("git")}><Text style={{ color:T.textMuted, fontSize:8, letterSpacing:1 }}>🐙 GitHub</Text></TouchableOpacity>
        </View>
      </GlassCard>
    </ScrollView>
  );

  const renderTab = () => {
    switch (activeTab) {
      case "dashboard": return renderDashboard();
      case "media":     return <View style={{flex:1, padding:16}}><MediaScreen send={send} media={media} /></View>;
      case "touchpad":  return <View style={{flex:1, padding:16}}><TouchpadScreen send={send} sensitivity={touchpadSensitivity} onSensitivityChange={updateSensitivity} /></View>;
      case "keyboard":  return <View style={{flex:1, padding:16}}><KeyboardScreen send={send} /></View>;
      case "system":    return <View style={{flex:1, padding:16}}><SystemScreen send={send} /></View>;
      default:          return null;
    }
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00E5FF" />
      </View>
    );
  }

  return (
    <ThemeContext.Provider value={T}>
      <View style={{ flex:1, backgroundColor:T.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
        <SafeAreaView style={{ backgroundColor:T.bg }}>
          <View style={{ paddingHorizontal:20, paddingTop:16, paddingBottom:12, borderBottomWidth:T.borderW, borderBottomColor:T.border }}>
            <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <View>
                <Text style={{ fontSize:24, fontWeight:"900", color:T.text, letterSpacing:5 }}>SYS<Text style={{ color:T.accent }}>CTRL</Text></Text>
                <Text style={{ fontSize:8, color:T.textDim, letterSpacing:3, marginTop:1 }}>REMOTE INTERACTION Matrix v5.3</Text>
              </View>
              <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
                <TouchableOpacity onPress={() => setThemeModalVisible(true)} style={{ padding:6 }}><Text style={{ fontSize:18 }}>🎨</Text></TouchableOpacity>
                <View style={{ width:8, height:8, borderRadius:4, backgroundColor: connected ? T.success : T.danger }} />
                <Text style={{ fontSize:10, letterSpacing:2, fontWeight:"700", color: connected ? T.success : T.danger }}>{connected ? "ONLINE" : "OFFLINE"}</Text>
              </View>
            </View>
            <View style={{ flexDirection:"row", gap:8 }}>
              <View style={{ flex:1, backgroundColor:T.surface, borderRadius:8, borderWidth:T.borderW, borderColor:T.border, paddingHorizontal:12, paddingVertical:8 }}>
                <Text style={{ fontSize:8, color:T.textDim, letterSpacing:2, marginBottom:3 }}>NODE BROADCAST IP</Text>
                <TextInput style={{ color:T.accent, fontSize:14, fontWeight:"600", padding:0 }} value={ip} onChangeText={setIp} placeholder="192.168.x.x" placeholderTextColor={T.textDim} keyboardType="numeric" />
              </View>
              <TouchableHighlight onPress={() => { haptic("light"); setShowDiscovery(true); }} underlayColor={T.surface} style={{ backgroundColor: T.surface, borderRadius: 8, borderWidth: T.borderW, borderColor: T.g2, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: T.g2, fontSize: 9, fontWeight:"700", letterSpacing:1, textAlign:"center" }}>📡{"\n"}SCAN</Text>
              </TouchableHighlight>
              <TouchableHighlight onPress={() => { haptic("light"); setShowQRScanner(true); }} underlayColor={T.surface} style={{ backgroundColor: T.surface, borderRadius: 8, borderWidth: T.borderW, borderColor: T.g1, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: T.g1, fontSize: 9, fontWeight:"700", letterSpacing:1, textAlign:"center" }}>📷{"\n"}QR</Text>
              </TouchableHighlight>
            </View>
          </View>
        </SafeAreaView>
        
        <View style={{ flex:1 }}>{renderTab()}</View>
        
        <View style={{ flexDirection:"row", borderTopWidth:T.borderW, borderTopColor:T.border, backgroundColor:T.surface, paddingBottom:8, paddingTop:8 }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} onPress={() => { haptic("light"); setActiveTab(tab.id); }} style={{ flex:1, alignItems:"center" }}>
                <Text style={{ fontSize:20, marginBottom:3 }}>{tab.icon}</Text>
                <Text style={{ fontSize:8, letterSpacing:1.5, fontWeight:"700", color: active ? T.accent : T.textMuted }}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <QRScannerModal visible={showQRScanner} onClose={() => setShowQRScanner(false)} onPaired={handleQRPaired} />
        <DiscoveryModal visible={showDiscovery} onClose={() => setShowDiscovery(false)} onSelect={setIp} httpPort={httpPort} />
        <AppLauncherModal visible={showApps} onClose={() => setShowApps(false)} ip={ip} httpPort={httpPort} send={send} />
        <ThemeModal visible={themeModalVisible} onClose={() => setThemeModalVisible(false)} currentTheme={themeId} onSelect={selectTheme} />
      </View>
    </ThemeContext.Provider>
  );
}