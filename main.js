import * as THREE from 'three'
import config from "./config.json"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { downloadTrimmedImage, wait } from './utils'

const loader = new GLTFLoader()
const width = window.innerWidth
const height = window.innerHeight
const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
camera.position.z = 1;

const scene = new THREE.Scene();

var ambientLight = new THREE.AmbientLight(0xffffff);
scene.add(ambientLight);

var directionalLight = new THREE.DirectionalLight(0xffffff);
directionalLight.position.set(0, 1, 1).normalize();
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

const downloadModel = (key) => {
  const data = config[key]
  const rotOffset = config[key].rotOffset ?? [0, 0, 0]
  
  return new Promise((resolve) => {
    loader.load(
      data.src,
      async (gltf) => {
        const object = gltf.scene
        object.scale.set(...data.scale);
        object.position.set(...data.pos)

        scene.add(object);
        scene.background = null

        // Setup animation mixer if animations exist
        let mixer = null;
        let animationAction = null;
        const animations = gltf.animations;
        
        if (animations && animations.length > 0 && data.useAnimation) {
          mixer = new THREE.AnimationMixer(object);
          
          // Select which animation to play (default to first, or specify by index/name)
          const animIndex = data.animationIndex ?? 0;
          const animation = typeof animIndex === 'string' 
            ? animations.find(a => a.name === animIndex) 
            : animations[animIndex];
          
          if (animation) {
            animationAction = mixer.clipAction(animation);
            animationAction.play();
            console.log(`Playing animation: ${animation.name}, duration: ${animation.duration}s`);
          }
        }

        // Generate rotation configurations
        const drx = Array.isArray(data.dr) ? data.dr[0] ?? 5 : 5
        const dry = Array.isArray(data.dr) ? data.dr[1] ?? 10 : 10
        const rotations = data.frames ?? [
          [-drx, 0, 0, "down"],
          [-drx, dry, 0, "down_left"],
          [0, 0, 0, ""],
          [0, dry, 0, "left"],
          [drx, 0, 0, "up"],
          [drx, dry, 0, "up_left"],
        ].map(r => {
          return [r[0] + rotOffset[0], r[1] + rotOffset[1], r[2] + rotOffset[2], r[3]]
        })

        // Process each rotation angle
        for (const rotation of rotations) {
          const name = rotation[3]
          if (!data.up && name.startsWith("up")) continue
          
          const r = rotation.slice(0, 3).map((r, i) => (r + data.rOffset[i]) * Math.PI / 180)
          object.rotation.set(...r)

          // If animation is enabled, capture multiple frames from the animation
          if (mixer && animationAction) {
            const animFrames = data.animFrames ?? 8; // Number of frames to capture
            const animDuration = animationAction.getClip().duration;
            
            // Support animation offset and range
            const animOffset = data.animOffset ?? 0; // Start time offset (in seconds or normalized 0-1)
            const animRange = data.animRange ?? 1; // Duration to capture (in seconds or normalized 0-1)
            
            // Normalize values if they're between 0-1 (treat as percentage of total duration)
            const startTime = animOffset <= 1 ? animOffset * animDuration : animOffset;
            const duration = animRange <= 1 ? animRange * animDuration : animRange;
            const endTime = Math.min(startTime + duration, animDuration);
            
            const timeStep = (endTime - startTime) / animFrames;
            
            // Option 1: Sample frames evenly across animation
            if (data.animMode === 'sample' || !data.animMode) {
              for (let i = 0; i < animFrames; i++) {
                const time = startTime + (i * timeStep);
                mixer.setTime(time);
                
                console.log(`downloading ${name}_frame${i} at time ${time.toFixed(2)}s`)
                renderer.render(scene, camera);
                
                if (config.download === false && config.preview) {
                  await wait(data.delay ?? 0.5)
                  continue
                }
                
                downloadTrimmedImage(renderer.domElement, `${key}${name ? '_' + name : ''}_f${i}`)
              }
            }
            // Option 2: Play animation in real-time and capture frames
            else if (data.animMode === 'realtime') {
              mixer.setTime(startTime);
              clock.start();
              let lastTime = startTime;
              
              for (let i = 0; i < animFrames; i++) {
                const targetTime = startTime + (i * timeStep);
                
                // Update animation to target time
                while (lastTime < targetTime) {
                  const delta = Math.min(1/60, targetTime - lastTime);
                  mixer.update(delta);
                  lastTime += delta;
                }
                
                console.log(`downloading ${name}_frame${i} at time ${targetTime.toFixed(2)}s`)
                renderer.render(scene, camera);
                
                if (config.download === false && config.preview) {
                  await wait(data.delay ?? 0.5)
                  continue
                }
                
                downloadTrimmedImage(renderer.domElement, `${key}${name ? '_' + name : ''}_f${i}`)
              }
            }
          } else {
            // Static model - single frame per rotation
            console.log(`downloading ${name}`)
            renderer.render(scene, camera);
            
            if (config.download === false && config.preview) {
              await wait(data.delay ?? 3)
              continue
            }
            
            downloadTrimmedImage(renderer.domElement, key + (name ? '_' + name : ""))
          }
        }
        
        scene.remove(object)
        resolve()
      },
      undefined,
      (error) => {
        console.error('An error happened', error);
      },
    )
  })
}

;(async () => {
  if (config.preview) {
    await downloadModel(config.active)
    return
  }
  for (const key in config) {
    const data = config[key]
    if (!data.src) continue
    await downloadModel(key)
  }
})();