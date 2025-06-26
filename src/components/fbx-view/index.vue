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

    <!-- ✅ 悬浮调试面板 -->
    <div class="debug-panel">
      <h3>调试面板</h3>

      <div class="input-group">
        <label>模型缩放</label>
        <input type="range" min="0.01" max="10" step="0.01" v-model.number="debug.scale" />
        <span>{{ debug.scale.toFixed(2) }}</span>
      </div>

      <div class="input-group">
        <label>模型位置 X</label>
        <input type="number" step="1" v-model.number="debug.position.x" />
      </div>
      <div class="input-group">
        <label>模型位置 Y</label>
        <input type="number" step="1" v-model.number="debug.position.y" />
      </div>
      <div class="input-group">
        <label>模型位置 Z</label>
        <input type="number" step="1" v-model.number="debug.position.z" />
      </div>

      <div class="input-group">
        <label>底图大小</label>
        <input type="number" step="1" min="10" v-model.number="debug.groundSize" />
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

      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      hoverName: '',
      labelPosition: new THREE.Vector3(),
      selectedMesh: null,

      loading: true,
      loadingProgress: 0,

      debug: {
        scale: 1,
        position: { x: 0, y: 0, z: 0 },
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
        userSelect: 'none'
      }
    }
  },
  watch: {
    // 监听调试参数变化，实时应用到模型
    debug: {
      deep: true,
      handler() {
        if (this.model) {
          this.model.scale.setScalar(this.debug.scale)
          this.model.position.set(
            this.debug.position.x,
            this.debug.position.y,
            this.debug.position.z
          )
        }

        const ground = this.modelGroup.children.find(obj => obj.userData.isGround)
        if (ground) {
          const s = this.debug.groundSize
          ground.geometry.dispose()
          ground.geometry = new THREE.PlaneGeometry(s, s)
        }
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
      this.camera.position.set(
        this.cameraConfig.position.x,
        this.cameraConfig.position.y,
        this.cameraConfig.position.z
      )

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
        this.controls.enableZoom = true
        this.controls.minPolarAngle = THREE.MathUtils.degToRad(10)
        this.controls.maxPolarAngle = THREE.MathUtils.degToRad(75)
        this.controls.enablePan = false
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
              child.material.needsUpdate = true
            }
          })

          const box = new THREE.Box3().setFromObject(fbx)
          fbx.position.y = -box.min.y
          fbx.rotation.x = -Math.PI / 2

          this.model = fbx
          this.modelGroup.add(fbx)

          this.updateModelTransform()

          if (this.autoCamera) this.fitCameraToObject()
          if (this.groundTextureUrl) this.addGroundPlane()

          this.loading = false
        },
        xhr => {
          this.loadingProgress = Math.round((xhr.loaded / xhr.total) * 100)
        },
        err => {
          console.error('加载失败:', err)
          this.loading = false
        }
      )
    },

    addGroundPlane() {
      if (this.groundMesh) this.modelGroup.remove(this.groundMesh)

      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(this.groundTextureUrl, texture => {
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
        texture.flipY = false
        texture.encoding = THREE.sRGBEncoding

        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
        const geometry = new THREE.PlaneGeometry(this.groundSize, this.groundSize)
        const plane = new THREE.Mesh(geometry, material)

        plane.rotation.x = -Math.PI / 2
        plane.position.y = -0.05
        plane.userData.isGround = true

        this.groundMesh = plane
        this.modelGroup.add(plane)
      })
    },

    updateModelTransform() {
      if (!this.model) return
      this.model.position.set(this.modelPos.x, this.modelPos.y, this.modelPos.z)
      this.model.scale.set(this.modelScale.x, this.modelScale.y, this.modelScale.z)
    },

    updateGroundPlane() {
      this.addGroundPlane()
    },

    fitCameraToObject() {
      const box = new THREE.Box3().setFromObject(this.modelGroup)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      this.camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim)
      this.controls.target.copy(center)
      this.controls.update()
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
          this.hoverName = mesh.name || '未命名'
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
    }
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

.debug-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 220px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
  font-size: 14px;
  z-index: 999;
}

.debug-panel h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #333;
}

.input-group {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.input-group label {
  flex: 1;
  font-size: 13px;
  color: #333;
}

.input-group input {
  flex: 1;
  margin-left: 4px;
}
</style>