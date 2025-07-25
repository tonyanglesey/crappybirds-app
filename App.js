import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StyleSheet,
  Image
} from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

// Assets
const birdImg = require("./assets/sprites/bird.png");
const poopImg = require("./assets/sprites/poop.png");
const pedImg = require("./assets/sprites/pedestrian.png");
const seedImg = require("./assets/sprites/seed.png");
const groundTile = require("./assets/sprites/ground_tile.png");

const BIRD_SIZE = 32;
const PEDESTRIAN_SIZE = 24;
const POOP_SIZE = 16;
const SEED_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 16;
const BIRD_SPEED_Y = 200;
const WORLD_SPEED = 120;
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
  const [dim, setDim] = useState(Dimensions.get("window"));
  const W = dim.width;
  const H = dim.height;
  const GROUND_Y = H * 0.85;

  const bird = useRef({
    x: W * 0.5,
    y: H * 0.5,
    w: BIRD_SIZE,
    h: BIRD_SIZE,
  });
  const fuel = useRef(MAX_FUEL);
  const isLanded = useRef(false);
  const poops = useRef([]);
  const peds = useRef([]);
  const seeds = useRef([]);
  const tiles = useRef([]);
  const gestureY = useRef(null);
  const lastFrame = useRef(Date.now());

  const [score, setScore] = useState(0);
  const [dispFuel, setDispFuel] = useState(MAX_FUEL);
  const [gameOver, setGameOver] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const lockAndInit = async () => {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
      const { width, height } = Dimensions.get("window");
      setDim({ width, height });

      bird.current = {
        x: width * 0.5,
        y: height * 0.5,
        w: BIRD_SIZE,
        h: BIRD_SIZE,
      };

      const groundY = height * 0.85;
      seeds.current = makeSeeds(width, groundY);
      peds.current = spawnPeds(width, groundY);
      tiles.current = makeTiles(width, groundY, TILE_WIDTH);

      setInitialized(true);
    };
    lockAndInit();
  }, []);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setDim(window);
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    let frameId;
    const loop = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrame.current) / 1000, 0.05);
      lastFrame.current = now;
      update(dt);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const update = (dt) => {
    if (gameOver || !initialized) return;
    const b = bird.current;

    peds.current.forEach(p => p.x += p.vx * dt);
    seeds.current.forEach(s => s.x -= WORLD_SPEED * dt);
    tiles.current.forEach(t => t.x -= WORLD_SPEED * dt);

    if (peds.current.length < 6) {
      peds.current = peds.current.concat(spawnPeds(W, GROUND_Y, 1));
    }
    if (tiles.current[0].x + TILE_WIDTH < 0) {
      tiles.current.shift();
      const lastX = tiles.current[tiles.current.length - 1].x;
      tiles.current.push({ x: lastX + TILE_WIDTH, y: GROUND_Y, w: TILE_WIDTH, h: TILE_HEIGHT });
    }
    if (seeds.current.length < 3) {
      seeds.current = seeds.current.concat(makeSeeds(W, GROUND_Y));
    }

    if (!isLanded.current) {
      if (gestureY.current !== null) {
        const targetY = gestureY.current - BIRD_SIZE / 2;
        b.y += (targetY - b.y) * 5 * dt;
        b.y = Math.max(0, Math.min(b.y, GROUND_Y - BIRD_SIZE));
      }
      fuel.current = Math.max(0, fuel.current - FUEL_DRAIN_PER_SEC * dt);
      if (fuel.current <= 0) setGameOver(true);
    } else {
      const onSeed = seeds.current.some(s => collides(b, s));
      if (onSeed) fuel.current = Math.min(MAX_FUEL, fuel.current + FUEL_REFILL_RATE * dt);
      else isLanded.current = false;
    }

    poops.current = poops.current
      .map(p => ({ ...p, y: p.y + POOP_SPEED * dt }))
      .filter(p => p.y < H);

    let hits = 0;
    poops.current.forEach((p, i) => {
      peds.current.forEach((ped, j) => {
        if (collides(p, ped)) { hits++; peds.current.splice(j,1); }
      });
    });
    if (hits) setScore(s=>s+hits);

    if (Math.abs(fuel.current - dispFuel) > EPSILON) setDispFuel(fuel.current);
  };

  const handleTouch = e => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 2) {
      const b = bird.current;
      poops.current.push({ x: b.x + b.w/2-POOP_SIZE/2, y: b.y+b.h, w:POOP_SIZE, h:POOP_SIZE });
      return;
    }
    gestureY.current = touches[0].pageY;
  };

  const handleTouchMove = e => {
    if (e.nativeEvent.touches.length === 1) {
      gestureY.current = e.nativeEvent.touches[0].pageY;
    }
  };

  const handleTouchEnd = () => {
    gestureY.current = null;
  };

  if (!initialized) return null;

  if (gameOver) {
    return (
      <View style={[styles.container, styles.center]}>  
        <Text style={styles.gameOver}>Game Over</Text>
        <TouchableOpacity onPress={() => {
          bird.current = { x: W * 0.5, y: H * 0.5, w: BIRD_SIZE, h: BIRD_SIZE };
          fuel.current = MAX_FUEL;
          setDispFuel(MAX_FUEL);
          peds.current = spawnPeds(W, GROUND_Y, 4);
          seeds.current = makeSeeds(W, GROUND_Y);
          tiles.current = makeTiles(W, GROUND_Y, TILE_WIDTH);
          poops.current = [];
          setScore(0);
          setGameOver(false);
          setInitialized(true);
        }} style={styles.button}>
          <Text style={styles.buttonText}>Restart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback 
      onPressIn={handleTouch} 
      onPressOut={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <View style={styles.container}>
        {tiles.current.map((t,i)=>(<Image key={i} source={groundTile} style={entityStyle(t)} resizeMode="stretch"/>))}
        {seeds.current.map((s,i)=>(<Image key={i} source={seedImg} style={entityStyle(s)}/>))}
        {peds.current.map((p,i)=>(<Image key={i} source={pedImg} style={entityStyle(p)}/>))}
        {poops.current.map((p,i)=>(<Image key={i} source={poopImg} style={entityStyle(p)}/>))}
        <Image source={birdImg} style={entityStyle(bird.current)}/>
        <View style={styles.hud}>
          <Text style={styles.hudText}>Score: {score}</Text>
          <Text style={styles.hudText}>Fuel: {dispFuel.toFixed(0)}</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

function makeSeeds(W, GROUND_Y) {
  const arr=[];
  for(let i=0;i<3;i++){
    arr.push({x:W + i* (W/3), y:GROUND_Y-SEED_SIZE, w:SEED_SIZE,h:SEED_SIZE});
  }
  console.log("🌰 Seeds:", arr);
  return arr;
}

function spawnPeds(W, GROUND_Y, n=4){
  const arr=[];
  for(let i=0;i<n;i++){
    const fromLeft=Math.random()<0.5;
    const x= fromLeft ? W + Math.random()*100 : -PEDESTRIAN_SIZE - Math.random()*100;
    const y = GROUND_Y - PEDESTRIAN_SIZE;
    arr.push({x, y, w: PEDESTRIAN_SIZE, h: PEDESTRIAN_SIZE, vx: fromLeft ? -WORLD_SPEED : WORLD_SPEED});
  }
  console.log("🚶‍♂️ Peds:", arr);
  return arr;
}

function makeTiles(W,GROUND_Y,tileW){
  const count= Math.ceil(W/tileW)+1;
  return Array.from({length:count}).map((_,i)=>({x:i*tileW,y:GROUND_Y,w:tileW,h:TILE_HEIGHT}));
}

function entityStyle(e){
  return {position:'absolute',left:e.x,top:e.y,width:e.w,height:e.h};
}

const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:'#87ceeb'},
  hud:{position:'absolute',top:8,left:8},
  hudText:{color:'#fff',fontWeight:'bold',fontSize:16},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  gameOver:{fontSize:32,color:'#fff',marginBottom:16},
  button:{backgroundColor:'#444',padding:12,borderRadius:8},
  buttonText:{color:'#fff',fontSize:18}
});
