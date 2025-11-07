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
        const drx = Array.isArray(data.dr) ? data.dr[0] ?? 5: 5
        const dry = Array.isArray(data.dr) ? data.dr[1] ?? 10: 10
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
        for (const rotation of rotations) {
          const name = rotation[3]
          if (!data.up && name.startsWith("up")) continue
          const r = rotation.slice(0, 3).map((r, i) => (r + data.rOffset[i]) * Math.PI / 180)
          console.log(`downloading ${name}`)
          object.rotation.set(...r)
          renderer.render(scene, camera);
          if (config.download === false && config.preview) {
            await wait(data.delay ?? 3)
            continue
          }
          downloadTrimmedImage(renderer.domElement, key + (name ? name : ""))
        }
        scene.remove(object)
        resolve()
      },
      undefined,
      (error) => {
        // called when loading has errors
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
