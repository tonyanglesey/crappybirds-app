import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

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
const EPSILON = 0.1;

const collides = (a, b) =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;

export default function App() {
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [initialized, setInitialized] = useState(false);

  const W = dimensions.width;
  const H = dimensions.height;
  const GROUND_Y = H * 0.85;

  const bird = useRef({ x: W * 0.2, y: H * 0.3, w: BIRD_SIZE, h: BIRD_SIZE });
  const fuel = useRef(MAX_FUEL);
  const isLanded = useRef(false);
  const poops = useRef([]);
  const pedestrians = useRef([]);
  const seedPiles = useRef([]);
  const touchYRef = useRef(null);

  const [score, setScore] = useState(0);
  const [displayFuel, setDisplayFuel] = useState(MAX_FUEL);
  const [displayIsLanded, setDisplayIsLanded] = useState(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT).then(() => {
      setTimeout(() => {
        // console.log("📐 Dimensions", W, H);
        seedPiles.current = makeSeedPiles(W, GROUND_Y);
        pedestrians.current = spawnPedestrians(W, GROUND_Y);
        // console.log("👟 Pedestrians spawned:", pedestrians.current);
        setInitialized(true);
      }, 300); // wait for layout to adjust
    });
  }, [W, H]);


  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    let frameId;
    let lastTime = Date.now();

    const loop = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      update(Math.min(dt, 0.05)); // clamp
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);


  const update = (dt) => {
    const b = bird.current;

    if (isLanded.current) {
      const onSeed = seedPiles.current.some((seed) => collides(b, seed));
      if (onSeed) {
        fuel.current = Math.min(MAX_FUEL, fuel.current + FUEL_REFILL_RATE * dt);
      } else {
        isLanded.current = false;
      }
    } else {
      b.x += BIRD_SPEED_X * dt;
      if (touchYRef.current !== null) {
        const dir = touchYRef.current < b.y ? -1 : 1;
        b.y += dir * BIRD_SPEED_Y * dt;
      }

      fuel.current = Math.max(0, fuel.current - FUEL_DRAIN_PER_SEC * dt);
      if (b.x > W) b.x = -b.w;
    }

    if (!isLanded.current) {
      if (b.y + b.h > GROUND_Y - 8) b.y = GROUND_Y - b.h - 8;
      if (b.y < 0) b.y = 0;
    } else {
      b.y = GROUND_Y - b.h;
    }

    poops.current = poops.current
      .map((p) => ({ ...p, y: p.y + POOP_SPEED * dt }))
      .filter((p) => p.y < H);

    pedestrians.current = pedestrians.current
      .map((p) => ({ ...p, x: p.x + p.vx * dt }))
      .filter((p) => p.x > -50 && p.x < W + 50);

    if (pedestrians.current.length < 6) {
      pedestrians.current = pedestrians.current.concat(spawnPedestrians(W, GROUND_Y));
    }

    const hitIdx = [];
    const poopIdx = [];
    poops.current.forEach((pp, i) => {
      pedestrians.current.forEach((ped, j) => {
        if (collides(pp, ped)) {
          hitIdx.push(j);
          poopIdx.push(i);
        }
      });
    });

    if (hitIdx.length > 0) {
      const pedSet = new Set(hitIdx);
      const poopSet = new Set(poopIdx);
      pedestrians.current = pedestrians.current.filter((_, j) => !pedSet.has(j));
      poops.current = poops.current.filter((_, i) => !poopSet.has(i));
      setScore((s) => s + hitIdx.length);
    }

    if (!isLanded.current) {
      const touchingGround = b.y + b.h >= GROUND_Y - 1;
      const overlapsSeed = seedPiles.current.some((seed) => collides(b, seed));
      if (touchingGround && overlapsSeed) {
        isLanded.current = true;
      }
    }

    setDisplayFuel(fuel.current);
    setDisplayIsLanded(isLanded.current);

    if (Math.abs(fuel.current - displayFuel) > EPSILON) {
      setDisplayFuel(fuel.current);
    }

    if (isLanded.current !== displayIsLanded) {
      setDisplayIsLanded(isLanded.current);
    }

  };

  const handleTouch = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      dropPoop();
      return;
    }
    const { locationY } = e.nativeEvent;
    touchYRef.current = locationY - BIRD_SIZE / 2;
  };

  const handleTouchEnd = () => {
    touchYRef.current = null;
  };

  const dropPoop = () => {
    if (fuel.current <= 5 || isLanded.current) return;
    const b = bird.current;
    fuel.current = Math.max(0, fuel.current - 8);
    poops.current.push({
      x: b.x + b.w / 2 - POOP_SIZE / 2,
      y: b.y + b.h,
      w: POOP_SIZE,
      h: POOP_SIZE,
    });
  };

  if (!initialized) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 18 }}>Loading Crappy Birds...</Text>
      </View>
    );
  }

  if (fuel.current <= 0 && !isLanded.current) {
  return (
    <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
      <Text style={{ color: "#fff", fontSize: 32, marginBottom: 16 }}>💀 Game Over</Text>
      <Text style={{ color: "#fff", fontSize: 20, marginBottom: 32 }}>Your bird ran out of fuel!</Text>
      <TouchableOpacity
        style={{ backgroundColor: "#444", padding: 16, borderRadius: 8 }}
        onPress={() => {
          bird.current = { ...bird.current, y: H / 2, vy: 0 };
          fuel.current = MAX_FUEL;
          seedPiles.current = makeSeedPiles(W, GROUND_Y);
          pedestrians.current = spawnPedestrians(W, GROUND_Y);
          poops.current = [];
          setScore(0);
          setDisplayFuel(MAX_FUEL);
        }}
      >
        <Text style={{ color: "#fff", fontSize: 18 }}>Restart</Text>
      </TouchableOpacity>
    </View>
  );
}


  return (
    <TouchableWithoutFeedback
      onPressIn={handleTouch}
      onPressOut={handleTouchEnd}
    >
      <View style={styles.container}>
        <View style={[styles.ground, { top: GROUND_Y, height: H - GROUND_Y }]} />

        {seedPiles.current.map((s, i) => (
          <View key={`seed-${i}`} style={[styles.seed, entityStyle(s)]} />
        ))}

        {pedestrians.current.map((p, i) => (
          <View key={`ped-${i}`} style={[styles.pedestrian, entityStyle(p)]} />
        ))}

        {poops.current.map((pp, i) => (
          <View key={`poop-${i}`} style={[styles.poop, entityStyle(pp)]} />
        ))}

        <View style={[styles.bird, entityStyle(bird.current)]} />

        <View style={styles.hud}>
          <Text style={styles.hudText}>Score: {score}</Text>
          <Text style={styles.hudText}>Fuel: {displayFuel.toFixed(0)}</Text>
          {displayIsLanded && <Text style={styles.hudText}>Refueling…</Text>}
          <Text style={styles.hudTextSmall}>
            1 finger = fly • 2 fingers = 💩
          </Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}


function entityStyle(e) {
  return {
    left: e.x,
    top: e.y,
    width: e.w,
    height: e.h,
    position: "absolute",
  };
}

function spawnPedestrians(W, GROUND_Y, n = 4) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const fromLeft = Math.random() < 0.5;
    const spawnX = fromLeft
      ? -PEDESTRIAN_SIZE - Math.random() * 50
      : W + PEDESTRIAN_SIZE + Math.random() * 50;

    arr.push({
      x: spawnX,
      y: GROUND_Y - PEDESTRIAN_SIZE,
      w: PEDESTRIAN_SIZE,
      h: PEDESTRIAN_SIZE,
      vx: fromLeft ? PEDESTRIAN_SPEED : -PEDESTRIAN_SPEED,
    });
  }
  return arr;
}


function makeSeedPiles(W, GROUND_Y) {
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
    width: "100%",
    backgroundColor: "#5c3c1f",
  },
  bird: { backgroundColor: "#222", borderRadius: 50 },
  poop: { backgroundColor: "#8B4513", borderRadius: 50 },
  pedestrian: { backgroundColor: "#ff6666", borderRadius: 4 },
  seed: { backgroundColor: "#f4d742", borderRadius: 4 },
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
