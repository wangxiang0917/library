<template>
  <div class="fbx-viewer-wrapper" ref="wrapper">
    <div ref="container" class="fbx-viewer-container"></div>

    <!-- 加载中遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ loadingProgress }}%</div>
    </div>

    <!-- 悬浮标签 -->
    <div v-if="hoverName" :style="labelStyle" class="name-label">{{ hoverName }}</div>

    <!-- ✅ 调试面板 -->
    <div class="debug-panel">
      <h4>调试面板</h4>

      <!-- 模型缩放 -->
      <label>模型缩放:
        <input type="range" min="0.1" max="10" step="0.1" v-model.number="debug.modelScale" @input="updateModelTransform" />
        <span>{{ debug.modelScale }}</span>
      </label>

      <!-- 模型位置 -->
      <label>模型 X:
        <input type="number" step="1" v-model.number="debug.modelPosition.x" @input="updateModelTransform" />
      </label>
      <label>模型 Y:
        <input type="number" step="1" v-model.number="debug.modelPosition.y" @input="updateModelTransform" />
      </label>
      <label>模型 Z:
        <input type="number" step="1" v-model.number="debug.modelPosition.z" @input="updateModelTransform" />
      </label>

      <!-- 底图大小 -->
      <label>地面大小:
        <input type="number" step="100" v-model.number="debug.groundSize" @input="updateGroundPlane" />
      </label>

      <!-- 相机位置 -->
      <label>相机 X:
        <input type="number" v-model.number="debug.cameraPosition.x" @input="updateCameraPosition" />
      </label>
      <label>相机 Y:
        <input type="number" v-model.number="debug.cameraPosition.y" @input="updateCameraPosition" />
      </label>
      <label>相机 Z:
        <input type="number" v-model.number="debug.cameraPosition.z" @input="updateCameraPosition" />
      </label>
    </div>
  </div>
</template>

<script>
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

export default {
  name: 'FbxViewer',
  props: {
    modelUrl: { type: String, required: true },
    groundTextureUrl: { type: String, default: '' },
    backgroundColor: { type: String, default: '#f0f0f0' },
    showControls: { type: Boolean, default: true },
    autoCamera: { type: Boolean, default: false },
    groundSize: { type: Number, default: 1000 },
    cameraConfig: {
      type: Object,
      default: () => ({
        position: { x: 50, y: 30, z: 50 },
        target: { x: 0, y: 0, z: 0 }
      })
    }
  },
  data() {
    return {
      // ThreeJS核心
      scene: null,
      camera: null,
      renderer: null,
      controls: null,
      model: null,
      modelGroup: null,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      selectedMesh: null,
      hoverName: '',
      labelPosition: new THREE.Vector3(),
      loading: true,
      loadingProgress: 0,

      groundPlane: null, // ✅ 地面 mesh 引用

      // ✅ 调试面板数据
      debug: {
        modelScale: 1,
        modelPosition: { x: 0, y: 0, z: 0 },
        groundSize: 1000,
        cameraPosition: { x: 50, y: 30, z: 50 }
      }
    }
  },
  computed: {
    labelStyle() {
      const pos = this.labelPosition.clone().project(this.camera)
      const x = (pos.x * 0.5 + 0.5) * this.$refs.wrapper.clientWidth
      const y = (-pos.y * 0.5 + 0.5) * this.$refs.wrapper.clientHeight
      return {
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none',
        color: '#00f',
        background: 'rgba(255,255,255,0.8)',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '14px',
        whiteSpace: 'nowrap',
        userSelect: 'none'
      }
    }
  },
  mounted() {
    this.initThreeJS()
    this.loadModel()
    window.addEventListener('resize', this.handleResize)
    this.$refs.container.addEventListener('mousemove', this.onHover)
  },
  beforeDestroy() {
    this.cleanup()
    window.removeEventListener('resize', this.handleResize)
    this.$refs.container.removeEventListener('mousemove', this.onHover)
  },
  methods: {
    initThreeJS() {
      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(this.backgroundColor)

      const w = this.$refs.container.clientWidth
      const h = this.$refs.container.clientHeight
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000)
      this.camera.position.set(...Object.values(this.debug.cameraPosition))

      this.renderer = new THREE.WebGLRenderer({ antialias: true })
      this.renderer.setSize(w, h)
      this.renderer.setPixelRatio(window.devicePixelRatio)
      this.$refs.container.appendChild(this.renderer.domElement)

      this.scene.add(new THREE.AmbientLight(0x666666))
      const dirLight = new THREE.DirectionalLight(0xffffff, 3)
      dirLight.position.set(100, 200, 100)
      this.scene.add(dirLight)

      this.modelGroup = new THREE.Group()
      this.scene.add(this.modelGroup)
      this.scene.add(new THREE.AxesHelper(1000))

      if (this.showControls) {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.target.set(
          this.cameraConfig.target.x,
          this.cameraConfig.target.y,
          this.cameraConfig.target.z
        )
        this.controls.update()
      }

      this.animate()
    },
    loadModel() {
      const loader = new FBXLoader()
      loader.load(
        this.modelUrl,
        fbx => {
          fbx.traverse(child => {
            if (child.isMesh) {
              child.material.side = THREE.DoubleSide
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          this.model = fbx
          this.modelGroup.add(fbx)
          this.updateModelTransform()

          if (this.groundTextureUrl) {
            this.debug.groundSize = this.groundSize
            this.addGroundPlane(this.groundSize)
          }

          this.loading = false
        },
        xhr => {
          this.loadingProgress = Math.round((xhr.loaded / xhr.total) * 100)
        },
        err => {
          console.error('模型加载失败:', err)
          this.loading = false
        }
      )
    },
    addGroundPlane(size) {
      const loader = new THREE.TextureLoader()
      loader.load(this.groundTextureUrl, texture => {
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
        texture.flipY = false
        texture.encoding = THREE.sRGBEncoding

        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
        plane.rotation.x = -Math.PI / 2
        plane.position.y = -0.1
        plane.userData.isGround = true

        this.modelGroup.add(plane)
        this.groundPlane = plane
      })
    },
    updateModelTransform() {
      if (this.model) {
        this.model.scale.setScalar(this.debug.modelScale)
        this.model.position.set(
          this.debug.modelPosition.x,
          this.debug.modelPosition.y,
          this.debug.modelPosition.z
        )
      }
    },
    updateGroundPlane() {
      if (this.groundPlane) {
        const size = this.debug.groundSize
        this.groundPlane.geometry.dispose()
        this.groundPlane.geometry = new THREE.PlaneGeometry(size, size)
      }
    },
    updateCameraPosition() {
      this.camera.position.set(
        this.debug.cameraPosition.x,
        this.debug.cameraPosition.y,
        this.debug.cameraPosition.z
      )
    },
    onHover(event) {
      const rect = this.$refs.container.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(this.mouse, this.camera)
      const intersects = this.raycaster.intersectObjects(this.modelGroup.children, true)

      if (intersects.length > 0) {
        const mesh = intersects[0].object
        if (mesh.userData.isGround) return
        if (this.selectedMesh !== mesh) {
          this.selectedMesh = mesh
          this.hoverName = mesh.name || '未命名模块'
        }
      } else {
        this.selectedMesh = null
        this.hoverName = ''
      }
    },
    animate() {
      requestAnimationFrame(this.animate)
      if (this.controls) this.controls.update()
      this.renderer.render(this.scene, this.camera)
    },
    handleResize() {
      const w = this.$refs.container.clientWidth
      const h = this.$refs.container.clientHeight
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
    },
    cleanup() {
      if (this.renderer?.domElement) {
        this.$refs.container.removeChild(this.renderer.domElement)
      }
    }
  }
}
</script>

<style scoped>
.fbx-viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.fbx-viewer-container {
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 100%;
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-text {
  color: #fff;
  margin-top: 10px;
  font-size: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.name-label {
  position: absolute;
  background: rgba(255, 255, 255, 0.8);
  color: #00f;
  font-size: 14px;
  border-radius: 4px;
  padding: 2px 6px;
  transform: translate(-50%, -100%);
  pointer-events: none;
  z-index: 100;
}

/* ✅ 悬浮调试面板样式 */
.debug-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 220px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  padding: 10px;
  z-index: 999;
  font-size: 14px;
}
.debug-panel h4 {
  margin: 0 0 10px;
  font-size: 16px;
}
.debug-panel label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  align-items: center;
  gap: 4px;
}
.debug-panel input[type="number"],
.debug-panel input[type="range"] {
  flex: 1;
}
</style>
