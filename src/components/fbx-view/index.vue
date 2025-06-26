<template>
  <div class="fbx-viewer-wrapper" ref="wrapper">
    <div ref="container" class="fbx-viewer-container"></div>

    <!-- 加载中遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ loadingProgress }}%</div>
    </div>

    <!-- 悬浮标签，显示 Hover 名称 -->
    <div v-if="hoverName" :style="labelStyle" class="name-label">{{ hoverName }}</div>

    <!-- 新增：调试面板 -->
    <div class="debug-panel">
      <h4>调试面板</h4>
      <div class="group">
        <label>模型位置 X: <input type="number" v-model.number="debug.modelPosX" step="1" /></label>
        <label>Y: <input type="number" v-model.number="debug.modelPosY" step="1" /></label>
        <label>Z: <input type="number" v-model.number="debug.modelPosZ" step="1" /></label>
      </div>
      <div class="group">
        <label>缩放比例: <input type="range" min="0.1" max="10" step="0.1" v-model.number="debug.modelScale" /></label>
        <span>{{ debug.modelScale.toFixed(1) }}</span>
      </div>
      <div class="group">
        <label>Y轴旋转: <input type="range" min="0" max="360" step="1" v-model.number="debug.modelRotationY" /></label>
        <span>{{ debug.modelRotationY }}°</span>
      </div>
      <hr />
      <div class="group">
        <label>相机位置 X: <input type="number" v-model.number="debug.cameraPosX" step="1" /></label>
        <label>Y: <input type="number" v-model.number="debug.cameraPosY" step="1" /></label>
        <label>Z: <input type="number" v-model.number="debug.cameraPosZ" step="1" /></label>
      </div>
      <div class="group">
        <label>相机目标 X: <input type="number" v-model.number="debug.cameraTargetX" step="1" /></label>
        <label>Y: <input type="number" v-model.number="debug.cameraTargetY" step="1" /></label>
        <label>Z: <input type="number" v-model.number="debug.cameraTargetZ" step="1" /></label>
      </div>
      <hr />
      <div class="group">
        <label>底图大小: <input type="range" min="10" max="2000" step="10" v-model.number="debug.groundSize" /></label>
        <span>{{ debug.groundSize }}</span>
      </div>
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
    modelUrl: { type: String, required: true, default: 'https://edu-20230301.oss-cn-beijing.aliyuncs.com/%211RUBIXCUBE.fbx' },
    groundTextureUrl: { type: String, default: 'https://img1.baidu.com/it/u=1029958023,1900764162&fm=253&fmt=auto&app=138&f=JPEG?w=889&h=500' },
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
      scene: null,
      camera: null,
      renderer: null,
      controls: null,
      modelGroup: null,
      model: null,
      groundPlane: null,

      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      hoverName: '',
      labelPosition: new THREE.Vector3(),
      selectedMesh: null,

      loading: true,
      loadingProgress: 0,

      debug: {
        modelPosX: 0,
        modelPosY: 0,
        modelPosZ: 0,
        modelScale: 1,
        modelRotationY: 0,

        cameraPosX: 50,
        cameraPosY: 30,
        cameraPosZ: 50,
        cameraTargetX: 0,
        cameraTargetY: 0,
        cameraTargetZ: 0,

        groundSize: this.groundSize
      }
    }
  },
  computed: {
    labelStyle() {
      const pos = this.labelPosition.clone()
      pos.project(this.camera)
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
        userSelect: 'none',
        zIndex: 200
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
    if (this.controls) this.controls.removeEventListener('change', this.onControlsChange)
  },
  methods: {
    initThreeJS() {
      const w = this.$refs.container.clientWidth
      const h = this.$refs.container.clientHeight
      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(this.backgroundColor)

      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000)
      this.camera.position.set(this.debug.cameraPosX, this.debug.cameraPosY, this.debug.cameraPosZ)

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

      if (this.showControls) {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.minPolarAngle = THREE.MathUtils.degToRad(10)
        this.controls.maxPolarAngle = THREE.MathUtils.degToRad(75)
        this.controls.enablePan = false
        this.controls.enableZoom = true
        this.controls.target.set(this.debug.cameraTargetX, this.debug.cameraTargetY, this.debug.cameraTargetZ)
        this.controls.update()
        this.controls.addEventListener('change', this.onControlsChange)
      }

      this.animate()
    },
    loadModel() {
      const loader = new FBXLoader()
      loader.load(
        this.modelUrl,
        fbx => {
          const sanitizeMaterial = mat => {
            if (!mat || !mat.isMaterial) return mat
            const unsupported = ['.dds', '.exr']
            const keys = ['map', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'displacementMap']
            keys.forEach(key => {
              const tex = mat[key]
              const url = tex?.image?.src || ''
              if (!tex || unsupported.some(ext => url.endsWith(ext))) {
                mat[key] = null
              } else {
                tex.flipY = false
                tex.needsUpdate = true
              }
            })
            if (!mat.map && mat.color) {
              mat.colorWrite = true
              mat.needsUpdate = true
            }
            mat.side = THREE.DoubleSide
            return mat
          }

          fbx.traverse(child => {
            if (child.isMesh) {
              child.material = Array.isArray(child.material) ? child.material.map(sanitizeMaterial) : sanitizeMaterial(child.material)
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          const box = new THREE.Box3().setFromObject(fbx)
          const size = box.getSize(new THREE.Vector3())
          const dims = [size.x, size.y, size.z]
          const minIndex = dims.indexOf(Math.min(...dims))
          if (minIndex === 0) fbx.rotation.z = Math.PI / 2
          if (minIndex === 2) fbx.rotation.x = -Math.PI / 2

          box.setFromObject(fbx)
          fbx.position.y = -box.min.y

          this.model = fbx
          this.modelGroup.add(fbx)

          this.debug.modelPosX = fbx.position.x
          this.debug.modelPosY = fbx.position.y
          this.debug.modelPosZ = fbx.position.z

          if (this.autoCamera) this.fitCameraToObject()

          if (this.groundTextureUrl) {
            this.addGroundPlane(this.debug.groundSize)
          }

          this.loading = false
        },
        xhr => {
          this.loadingProgress = Math.round((xhr.loaded / xhr.total) * 100)
        },
        err => {
          console.error('FBX 加载失败:', err)
          this.loading = false
        }
      )
    },
    addGroundPlane(size) {
      if (this.groundPlane) {
        this.modelGroup.remove(this.groundPlane)
        this.groundPlane.geometry.dispose()
        this.groundPlane = null
      }
      const loader = new THREE.TextureLoader()
      loader.load(this.groundTextureUrl, tex => {
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
        tex.flipY = false
        tex.encoding = THREE.sRGBEncoding
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy() || 1

        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
        const geo = new THREE.PlaneGeometry(size, size)
        const plane = new THREE.Mesh(geo, mat)
        plane.rotation.x = -Math.PI / 2
        const box = new THREE.Box3().setFromObject(this.modelGroup)
        plane.position.y = box.min.y - 0.1
        plane.userData.isGround = true
        this.groundPlane = plane
        this.modelGroup.add(plane)
      })
    },
    fitCameraToObject() {
      const box = new THREE.Box3().setFromObject(this.modelGroup)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const dist = maxDim * 0.8
      this.camera.position.set(center.x, center.y + maxDim * 0.5, center.z + dist)
      if (this.controls) {
        this.controls.target.copy(center)
        this.controls.update()
      }
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
          if (this.selectedMesh?.material?.transparent) {
            this.selectedMesh.material.opacity = 1
            this.selectedMesh.material.transparent = false
          }
          if (mesh.material && 'opacity' in mesh.material) {
            mesh.material.transparent = true
            mesh.material.opacity = 0.3
          }
          this.selectedMesh = mesh
          this.hoverName = mesh.name || '未命名模块'
        }
      } else {
        if (this.selectedMesh?.material?.transparent) {
          this.selectedMesh.material.opacity = 1
          this.selectedMesh.material.transparent = false
        }
        this.selectedMesh = null
        this.hoverName = ''
      }
    },
    animate() {
      requestAnimationFrame(this.animate)
      if (this.controls) this.controls.update()
      if (this.selectedMesh) {
        const box = new THREE.Box3().setFromObject(this.selectedMesh)
        const top = new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y,
          (box.min.z + box.max.z) / 2
        )
        this.labelPosition.copy(top)
      }
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
    },
    onControlsChange() {
      const p = this.camera.position
      const t = this.controls.target
      this.debug.cameraPosX = +p.x.toFixed(2)
      this.debug.cameraPosY = +p.y.toFixed(2)
      this.debug.cameraPosZ = +p.z.toFixed(2)
      this.debug.cameraTargetX = +t.x.toFixed(2)
      this.debug.cameraTargetY = +t.y.toFixed(2)
      this.debug.cameraTargetZ = +t.z.toFixed(2)
    }
  },
  watch: {
    'debug.modelPosX'(v) { this.modelGroup.position.x = v },
    'debug.modelPosY'(v) { this.modelGroup.position.y = v },
    'debug.modelPosZ'(v) { this.modelGroup.position.z = v },
    'debug.modelScale'(v) { this.modelGroup.scale.set(v, v, v) },
    'debug.modelRotationY'(v) { this.modelGroup.rotation.y = THREE.MathUtils.degToRad(v) },
    'debug.cameraPosX'(v) { this.camera.position.x = v },
    'debug.cameraPosY'(v) { this.camera.position.y = v },
    'debug.cameraPosZ'(v) { this.camera.position.z = v },
    'debug.cameraTargetX'(v) { this.controls.target.x = v; this.controls.update() },
    'debug.cameraTargetY'(v) { this.controls.target.y = v; this.controls.update() },
    'debug.cameraTargetZ'(v) { this.controls.target.z = v; this.controls.update() },
    'debug.groundSize'(v) { this.addGroundPlane(v) }
  }
}
</script>

<style scoped>
.fbx-viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
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
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: #fff;
  margin-top: 10px;
  font-size: 16px;
}

.name-label {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.8);
  color: #00f;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
  transform: translate(-50%, -100%);
  pointer-events: none;
  user-select: none;
  z-index: 100;
}

/* 调试面板样式 */
.debug-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 260px;
  background: rgba(255, 255, 255, 0.95);
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  z-index: 200;
  font-size: 13px;
}

.debug-panel h4 {
  margin: 0 0 8px;
  text-align: center;
}

.debug-panel .group {
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.debug-panel label {
  flex: 1 1 48%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.debug-panel input[type="range"] {
  flex: 1;
}
</style>
