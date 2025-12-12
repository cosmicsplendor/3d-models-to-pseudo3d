import * as THREE from 'three'
import config from "./config.json"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { downloadTrimmedImage, wait } from './utils'
import GUI from 'lil-gui';

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
  
  // --- CHANGE START ---
  // Use a Set to track which files have been downloaded in this session.
  // This prevents re-downloading in a preview loop (while(true)).
  const downloadedFiles = new Set();
  // --- CHANGE END ---

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
          [-drx, dry, 0, "downleft"],
          [0, 0, 0, ""],
          [0, dry, 0, "left"],
          [drx, 0, 0, "up"],
          [drx, dry, 0, "upleft"],
        ].map(r => {
          return [r[0] + rotOffset[0], r[1] + rotOffset[1], r[2] + rotOffset[2], r[3]]
        })

        // Rotation order (default: 'XYZ')
        const rotationOrder = data.rotationOrder ?? 'XYZ'

        // Process each rotation angle
        for (const rotation of rotations) {
          let name
          
          // Support multiple rotation modes
          if (Array.isArray(rotation[0])) {
            // Quaternion mode: [[x, y, z, w], "name"]
            const [x, y, z, w] = rotation[0]
            name = rotation[1]
            object.quaternion.set(x, y, z, w)
          } else if (rotation.length === 5) {
            // Axis-angle mode: [axisX, axisY, axisZ, angle, "name"]
            const axis = new THREE.Vector3(rotation[0], rotation[1], rotation[2]).normalize()
            const angle = rotation[3] * Math.PI / 180
            name = rotation[4]
            object.quaternion.setFromAxisAngle(axis, angle)
          } else {
            // Euler angle mode: [x, y, z, "name"]
            name = rotation[3]
            const r = rotation.slice(0, 3).map((r, i) => (r + data.rOffset[i]) * Math.PI / 180)
            
            // Apply rotation with specified order
            object.rotation.order = rotationOrder
            object.rotation.set(...r)
          }
          
          if (!data.up && name && name.startsWith("up")) continue

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
              const captureFrames = async () => {
                for (let i = 0; i < animFrames; i++) {
                  const time = startTime + (i * timeStep);
                  mixer.setTime(time);
                  
                  renderer.render(scene, camera);

                  // --- CHANGE START ---
                  const filename = `${key}${name ? '' + name : ''}f${i}`;

                  // Only download if enabled AND this file hasn't been downloaded yet.
                  if (config.download !== false && !downloadedFiles.has(filename)) {
                    downloadTrimmedImage(renderer.domElement, filename);
                    downloadedFiles.add(filename); // Mark as downloaded
                  }
                  
                  // In preview mode, always wait for the delay to see the frame.
                  if (config.preview) {
                    await wait(data.delay ?? 0.5);
                  }
                  // --- CHANGE END ---
                }
              }
              
              // Loop animation in preview mode if enabled
              if (config.preview && data.loop) {
                while (true) {
                  await captureFrames()
                }
              } else {
                await captureFrames()
              }
            }
            // Option 2: Play animation in real-time and capture frames
            else if (data.animMode === 'realtime') {
              const captureFrames = async () => {
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
                  
                  renderer.render(scene, camera);
                  
                  // --- CHANGE START ---
                  const filename = `${key}${name ? '' + name : ''}f${i}`;

                  // Only download if enabled AND this file hasn't been downloaded yet.
                  if (config.download !== false && !downloadedFiles.has(filename)) {
                    downloadTrimmedImage(renderer.domElement, filename);
                    downloadedFiles.add(filename); // Mark as downloaded
                  }
                  
                  // In preview mode, always wait for the delay to see the frame.
                  if (config.preview) {
                    await wait(data.delay ?? 0.5);
                  }
                  // --- CHANGE END ---
                }
              }
              
              // Loop animation in preview mode if enabled
              if (config.preview && data.loop) {
                while (true) {
                  await captureFrames()
                }
              } else {
                await captureFrames()
              }
            }
          } else {
            // Static model - single frame per rotation
            renderer.render(scene, camera);
            
            // --- CHANGE START ---
            const filename = key + (name ? '' + name : "");
            
            // Only download if enabled AND this file hasn't been downloaded yet.
            if (config.download !== false && !downloadedFiles.has(filename)) {
              downloadTrimmedImage(renderer.domElement, filename);
              downloadedFiles.add(filename); // Mark as downloaded
            }
            
            // In preview mode, always wait for the delay to see the frame.
            if (config.preview) {
              await wait(data.delay ?? 3);
              continue; // continue is needed here as it's not in a separate captureFrames function
            }
            // --- CHANGE END ---
          }
        }
        if (config.rotationEditor) {
            const gui = new GUI();
            const folder = gui.addFolder('Rotation');
            
            // Create a temporary object to hold degrees for the GUI
            const rotationGUI = {
                x: 0,
                y: 0,
                z: 0
            };

            const updateRotation = () => {
                object.rotation.set(
                    rotationGUI.x * Math.PI / 180,
                    rotationGUI.y * Math.PI / 180,
                    rotationGUI.z * Math.PI / 180
                );
                renderer.render(scene, camera);
            };

            folder.add(rotationGUI, 'x', -180, 180).onChange(updateRotation);
            folder.add(rotationGUI, 'y', -180, 180).onChange(updateRotation);
            folder.add(rotationGUI, 'z', -180, 180).onChange(updateRotation);

            // Also add a button to log the current values to the console
            const actions = {
                logValues: () => {
                    console.log(`[${rotationGUI.x}, ${rotationGUI.y}, ${rotationGUI.z}]`);
                }
            };
            gui.add(actions, 'logValues').name('Log to Console');
            
            updateRotation(); // initial call
            
            // Prevent the rest of your download loop from running in GUI mode
            return; 
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