import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import * as ScreenOrientation from 'expo-screen-orientation';

const { width: W, height: H } = Dimensions.get("window");

const TICK_MS = 16;
const GROUND_Y = H * 0.85;
const BIRD_SIZE = 28;
const PEDESTRIAN_SIZE = 26;
const POOP_SIZE = 8;
const SEED_SIZE = 32;

const BIRD_SPEED_X = 120;
const BIRD_SPEED_Y = 200;
const PEDESTRIAN_SPEED = 50;
const POOP_SPEED = 260;
const MAX_FUEL = 100;
const FUEL_DRAIN_PER_SEC = 7;
const FUEL_REFILL_RATE = 40;

const collides = (a, b) =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;

export default function App() {
  const [score, setScore] = useState(0);
  const [fuel, setFuel] = useState(MAX_FUEL);
  const [isLanded, setIsLanded] = useState(false);
  const [bird, setBird] = useState({
    x: W * 0.2,
    y: H * 0.3,
    w: BIRD_SIZE,
    h: BIRD_SIZE,
    vy: 0,
  });
  const [poops, setPoops] = useState([]);
  const [pedestrians, setPedestrians] = useState([]);
  const [seedPiles, setSeedPiles] = useState(makeSeedPiles());
  const [lastTap, setLastTap] = useState(0);
  const touchYRef = useRef(null);
  const running = useRef(true);
  const lastFrame = useRef(Date.now());

  useEffect(() => {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
}, []);

  useEffect(() => {
    setPedestrians(spawnPedestrians());
  }, []);

  useEffect(() => {
    let id;
    const loop = () => {
      const now = Date.now();
      const dt = (now - lastFrame.current) / 1000;
      lastFrame.current = now;
      if (running.current) update(dt);
      id = setTimeout(loop, TICK_MS);
    };
    loop();
    return () => clearTimeout(id);
  }, [bird, pedestrians, poops, isLanded, fuel, score]);

  const update = (dt) => {
    let nbird = { ...bird };

    if (isLanded) {
      const onSeed = seedPiles.some((seed) => collides(nbird, seed));
      if (onSeed) {
        setFuel((f) => Math.min(MAX_FUEL, f + FUEL_REFILL_RATE * dt));
      } else {
        setIsLanded(false);
      }
    } else {
      nbird.x += BIRD_SPEED_X * dt;
      if (touchYRef.current !== null) {
        const targetY = touchYRef.current;
        if (Math.abs(targetY - nbird.y) > 4) {
          const dir = targetY < nbird.y ? -1 : 1;
          nbird.y += dir * BIRD_SPEED_Y * dt;
        }
      }

      setFuel((f) => Math.max(0, f - FUEL_DRAIN_PER_SEC * dt));
      if (nbird.x > W) nbird.x = -nbird.w;
    }

    if (!isLanded) {
      if (nbird.y + nbird.h > GROUND_Y - 8) nbird.y = GROUND_Y - nbird.h - 8;
      if (nbird.y < 0) nbird.y = 0;
    } else {
      nbird.y = GROUND_Y - nbird.h;
    }

    let npeds = pedestrians.map((p) => ({
      ...p,
      x: p.x + p.vx * dt,
    }));
    npeds = npeds.filter((p) => p.x > -50 && p.x < W + 50);
    if (npeds.length < 6) npeds = npeds.concat(spawnPedestrians(2));

    let npoops = poops.map((poop) => ({
      ...poop,
      y: poop.y + POOP_SPEED * dt,
    }));
    npoops = npoops.filter((p) => p.y < H);

    const hitIdx = [];
    const poopIdx = [];
    npoops.forEach((pp, i) => {
      npeds.forEach((ped, j) => {
        if (collides(pp, ped)) {
          hitIdx.push(j);
          poopIdx.push(i);
        }
      });
    });

    if (hitIdx.length > 0) {
      const pedSet = new Set(hitIdx);
      const poopSet = new Set(poopIdx);
      npeds = npeds.filter((_, j) => !pedSet.has(j));
      npoops = npoops.filter((_, i) => !poopSet.has(i));
      setScore((s) => s + hitIdx.length);
    }

    if (!isLanded) {
      const touchingGround = nbird.y + nbird.h >= GROUND_Y - 1;
      if (touchingGround) {
        const overlapsSeed = seedPiles.some((seed) => collides(nbird, seed));
        if (overlapsSeed) setIsLanded(true);
      }
    }

    setBird(nbird);
    setPedestrians(npeds);
    setPoops(npoops);
  };

  const handleTouch = (e) => {
  const touches = e.nativeEvent.touches;

  // 💩 Two-finger tap = poop
  if (touches.length === 2) {
    dropPoop();
    return;
  }

  // 🐦 One-finger = vertical movement
  const { locationY } = e.nativeEvent;
  touchYRef.current = locationY - BIRD_SIZE / 2;
};


  const handleTouchEnd = () => {
  touchYRef.current = null;
};

  const dropPoop = () => {
    if (fuel <= 5 || isLanded) return;
    setFuel((f) => Math.max(0, f - 8));
    setPoops((p) => [
      ...p,
      {
        x: bird.x + bird.w / 2 - POOP_SIZE / 2,
        y: bird.y + bird.h,
        w: POOP_SIZE,
        h: POOP_SIZE,
      },
    ]);
  };

  return (
    <TouchableWithoutFeedback
      onPressIn={handleTouch}
      onPressOut={handleTouchEnd}
    >
      <View style={styles.container}>
        <View style={[styles.ground, { top: GROUND_Y }]} />
        {seedPiles.map((s, i) => (
          <View key={`seed-${i}`} style={[styles.seed, seedStyle(s)]} />
        ))}
        {pedestrians.map((p, i) => (
          <View key={`ped-${i}`} style={[styles.pedestrian, entityStyle(p)]} />
        ))}
        {poops.map((pp, i) => (
          <View key={`poop-${i}`} style={[styles.poop, entityStyle(pp)]} />
        ))}
        <View style={[styles.bird, entityStyle(bird)]} />
        <View style={styles.hud}>
          <Text style={styles.hudText}>Score: {score}</Text>
          <Text style={styles.hudText}>Fuel: {fuel.toFixed(0)}</Text>
          {isLanded && <Text style={styles.hudText}>Refueling…</Text>}
          <Text style={styles.hudTextSmall}>
            Tap to move vertically — Double-tap to 💩
          </Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function entityStyle(e) {
  return { left: e.x, top: e.y, width: e.w, height: e.h, position: "absolute" };
}

function seedStyle(e) {
  return {
    ...entityStyle(e),
    backgroundColor: "#f4d742",
    borderRadius: 4,
  };
}

function spawnPedestrians(n = 4) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const fromLeft = Math.random() < 0.5;
    arr.push({
      x: fromLeft ? -PEDESTRIAN_SIZE : W + PEDESTRIAN_SIZE,
      y: GROUND_Y - PEDESTRIAN_SIZE,
      w: PEDESTRIAN_SIZE,
      h: PEDESTRIAN_SIZE,
      vx: fromLeft ? PEDESTRIAN_SPEED : -PEDESTRIAN_SPEED,
    });
  }
  return arr;
}

function makeSeedPiles() {
  const piles = [];
  for (let i = 0; i < 3; i++) {
    piles.push({
      x: Math.random() * (W - SEED_SIZE),
      y: GROUND_Y - SEED_SIZE,
      w: SEED_SIZE,
      h: SEED_SIZE,
    });
  }
  return piles;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#87ceeb" },
  ground: {
    position: "absolute",
    left: 0,
    width: W,
    height: H - GROUND_Y,
    backgroundColor: "#5c3c1f",
  },
  bird: {
    backgroundColor: "#222",
    borderRadius: 50,
  },
  poop: {
    backgroundColor: "#8B4513",
    borderRadius: 50,
  },
  pedestrian: {
    backgroundColor: "#ff6666",
    borderRadius: 4,
  },
  seed: {},
  hud: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hudText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  hudTextSmall: {
    color: "#fff",
    fontSize: 12,
    position: "absolute",
    bottom: 4,
    left: 8,
  },
});
