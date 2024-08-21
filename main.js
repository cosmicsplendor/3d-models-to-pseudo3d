import * as THREE from 'three'
import config from "./config.json"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { downloadTrimmedImage, wait } from './utils'
const data = config[config.active]

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

const rotations = [
  [-7.5, 0, 0, "down"],
  [-7.5, 15, 0, "down_left"],
  [0, 0, 0, ""],
  [0, 15, 0, "left"],
  [7.5, 0, 0, "up"],
  [7.5, 15, 0, "up_left"],
]

loader.load(
  data.src,
  async (gltf) => {
    const object = gltf.scene
    object.scale.set(...data.scale);
    object.position.set(...data.pos)

    scene.add(object);

    scene.add(object);
    scene.background = null
    
    for (const rotation of rotations) {
      const r = rotation.slice(0, 3).map((r, i) => (r + data.rOffset[i]) * Math.PI / 180)
      const name = rotation[3]
      console.log(`downloading ${name}.png`)
      object.rotation.set(...r)
      renderer.render(scene, camera);
      // downloadTrimmedImage(renderer.domElement, config.active + "_" + name)
      await wait(3)
    }
  },
  undefined,
  (error) => {
    // called when loading has errors
    console.error('An error happened', error);
  },
)


