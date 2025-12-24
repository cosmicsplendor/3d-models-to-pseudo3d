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
  const downloadedFiles = new Set();

  console.log("HERE")
  console.log(data.src)

  return new Promise((resolve, reject) => {
    loader.load(
      data.src,
      async (gltf) => {
        console.log('GLTF file loaded successfully:', data.src);
        console.log('Full loaded GLTF object:', gltf);

        const object = gltf.scene;
        console.log('The scene object:', object);

        if (object.children.length === 0) {
          console.error("ERROR: The loaded scene has no children! The model is empty.");
          return;
        }

        // Scale the object
        object.scale.set(...data.scale);

        // NEW: Handle pivot offset
        let rotationTarget;
        if (data.pivotOffset) {
          // Create a wrapper group for custom pivot point
          const wrapper = new THREE.Group();
          wrapper.add(object);

          // Offset the object inside the wrapper
          object.position.set(...data.pivotOffset);

          // Position the wrapper in the scene
          wrapper.position.set(...data.pos);
          scene.add(wrapper);

          rotationTarget = wrapper;
          console.log('Using pivot offset:', data.pivotOffset);
        } else {
          // No pivot offset - use object directly
          object.position.set(...data.pos);
          scene.add(object);
          rotationTarget = object;
        }

        console.log('Position after setting:', rotationTarget.position);
        console.log('Scale after setting:', object.scale);

        scene.background = null;

        // Setup animation mixer if animations exist
        let mixer = null;
        let animationAction = null;
        const animations = gltf.animations;

        if (config[config.active]?.rotationEditor) {
          const gui = new GUI();
          const folder = gui.addFolder('Rotation');

          const rotationGUI = {
            x: 0,
            y: 0,
            z: 0
          };

          const updateRotation = () => {
            rotationTarget.rotation.set(
              rotationGUI.x * Math.PI / 180,
              rotationGUI.y * Math.PI / 180,
              rotationGUI.z * Math.PI / 180
            );
            renderer.render(scene, camera);
          };

          folder.add(rotationGUI, 'x', -180, 180).onChange(updateRotation);
          folder.add(rotationGUI, 'y', -180, 180).onChange(updateRotation);
          folder.add(rotationGUI, 'z', -180, 180).onChange(updateRotation);

          const actions = {
            logValues: () => {
              console.log(`[${rotationGUI.x}, ${rotationGUI.y}, ${rotationGUI.z}]`);
            }
          };
          gui.add(actions, 'logValues').name('Log to Console');

          updateRotation();
          return;
        }

        if (animations && animations.length > 0 && data.useAnimation) {
          mixer = new THREE.AnimationMixer(object);

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

        const rotations = data.frames ?? [];
        const rotationOrder = data.rotationOrder ?? 'XYZ';

        // Process each rotation angle
        for (const rotation of rotations) {
          let name;

          // Support multiple rotation modes
          if (Array.isArray(rotation[0])) {
            // Quaternion mode: [[x, y, z, w], "name"]
            const [x, y, z, w] = rotation[0];
            name = rotation[1];
            rotationTarget.quaternion.set(x, y, z, w);
          } else if (rotation.length === 5) {
            // Axis-angle mode: [axisX, axisY, axisZ, angle, "name"]
            const axis = new THREE.Vector3(rotation[0], rotation[1], rotation[2]).normalize();
            const angle = rotation[3] * Math.PI / 180;
            name = rotation[4];
            rotationTarget.quaternion.setFromAxisAngle(axis, angle);
          } else {
            // Euler angle mode: [x, y, z, "name"]
            name = rotation[3];
            const r = rotation.slice(0, 3).map((r, i) => (r + data.rOffset[i]) * Math.PI / 180);

            // Apply rotation with specified order
            rotationTarget.rotation.order = rotationOrder;
            rotationTarget.rotation.set(...r);
          }

          // If animation is enabled, capture multiple frames from the animation
          if (mixer && animationAction) {
            const animFrames = data.animFrames ?? 8;
            const animDuration = animationAction.getClip().duration;

            const animOffset = data.animOffset ?? 0;
            const animRange = data.animRange ?? 1;

            const startTime = animOffset <= 1 ? animOffset * animDuration : animOffset;
            const duration = animRange <= 1 ? animRange * animDuration : animRange;
            const endTime = Math.min(startTime + duration, animDuration);

            const timeStep = (endTime - startTime) / animFrames;

            if (data.animMode === 'sample' || !data.animMode) {
              const captureFrames = async () => {
                for (let i = 0; i < animFrames; i++) {
                  const time = startTime + (i * timeStep);
                  mixer.setTime(time);

                  renderer.render(scene, camera);

                  const filename = `${key}${name ? '' + name : ''}${i}`;

                  if (config.download !== false && !downloadedFiles.has(filename)) {
                    downloadTrimmedImage(renderer.domElement, filename);
                    downloadedFiles.add(filename);
                  }

                  if (config.preview) {
                    await wait(data.delay ?? 0.5);
                  }
                }
              };

              if (config.preview && data.loop) {
                while (true) {
                  await captureFrames();
                }
              } else {
                await captureFrames();
              }
            } else if (data.animMode === 'realtime') {
              const captureFrames = async () => {
                mixer.setTime(startTime);
                clock.start();
                let lastTime = startTime;

                for (let i = 0; i < animFrames; i++) {
                  const targetTime = startTime + (i * timeStep);

                  while (lastTime < targetTime) {
                    const delta = Math.min(1 / 60, targetTime - lastTime);
                    mixer.update(delta);
                    lastTime += delta;
                  }

                  renderer.render(scene, camera);

                  const filename = `${key}${name ? '' + name : ''}f${i}`;

                  if (config.download !== false && !downloadedFiles.has(filename)) {
                    downloadTrimmedImage(renderer.domElement, filename);
                    downloadedFiles.add(filename);
                  }

                  if (config.preview) {
                    await wait(data.delay ?? 0.5);
                  }
                }
              };

              if (config.preview && data.loop) {
                while (true) {
                  await captureFrames();
                }
              } else {
                await captureFrames();
              }
            }
          } else {
            // Static model - single frame per rotation
            renderer.render(scene, camera);

            const filename = key + (name ? '' + name : "");

            if (config.download !== false && !downloadedFiles.has(filename)) {
              downloadTrimmedImage(renderer.domElement, filename);
              downloadedFiles.add(filename);
            }

            if (config.preview) {
              await wait(data.delay ?? 3);
              continue;
            }
          }
        }

        scene.remove(rotationTarget);
        resolve();
      },
      undefined,
      (error) => {
        console.error('An error happened', error);
        reject(error);
      }
    );
  });
};

; (async () => {
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