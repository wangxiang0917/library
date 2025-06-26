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

    <!-- 右上角悬浮调试面板 -->
    <div class="debug-panel">
      <h4>调试面板</h4>

      <section>
        <h5>模型位置</h5>
        <label>X: <input type="number" step="0.1" v-model.number="modelPosition.x"
            @input="updateModelPosition" /></label>
        <label>Y: <input type="number" step="0.1" v-model.number="modelPosition.y"
            @input="updateModelPosition" /></label>
        <label>Z: <input type="number" step="0.1" v-model.number="modelPosition.z"
            @input="updateModelPosition" /></label>
      </section>

      <section>
        <h5>模型缩放</h5>
        <label>X: <input type="number" step="0.01" min="0.01" v-model.number="modelScale.x"
            @input="updateModelScale" /></label>
        <label>Y: <input type="number" step="0.01" min="0.01" v-model.number="modelScale.y"
            @input="updateModelScale" /></label>
        <label>Z: <input type="number" step="0.01" min="0.01" v-model.number="modelScale.z"
            @input="updateModelScale" /></label>
      </section>

      <section>
        <h5>相机位置</h5>
        <label>X: <input type="number" step="0.1" v-model.number="cameraPosition.x"
            @input="updateCameraPosition" /></label>
        <label>Y: <input type="number" step="0.1" v-model.number="cameraPosition.y"
            @input="updateCameraPosition" /></label>
        <label>Z: <input type="number" step="0.1" v-model.number="cameraPosition.z"
            @input="updateCameraPosition" /></label>
      </section>

      <section>
        <h5>相机目标（观测点）</h5>
        <label>X: <input type="number" step="0.1" v-model.number="cameraTarget.x" @input="updateCameraTarget" /></label>
        <label>Y: <input type="number" step="0.1" v-model.number="cameraTarget.y" @input="updateCameraTarget" /></label>
        <label>Z: <input type="number" step="0.1" v-model.number="cameraTarget.z" @input="updateCameraTarget" /></label>
      </section>

      <section>
        <h5>底图大小</h5>
        <label>
          <input type="number" min="1" v-model.number="groundSize" @input="updateGroundSize" /> (边长)
        </label>
      </section>
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

      // 新增调试面板绑定数据（初始值与 props 保持一致）
      modelPosition: { x: 0, y: 0, z: 0 },
      modelScale: { x: 1, y: 1, z: 1 },

      cameraPosition: {
        x: this.cameraConfig.position.x,
        y: this.cameraConfig.position.y,
        z: this.cameraConfig.position.z
      },
      cameraTarget: {
        x: this.cameraConfig.target.x,
        y: this.cameraConfig.target.y,
        z: this.cameraConfig.target.z
      },

      groundSize: this.groundSize,

      groundPlane: null // 地面 Mesh 引用，方便更新大小
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
        this.controls.minPolarAngle = THREE.MathUtils.degToRad(10)
        this.controls.maxPolarAngle = THREE.MathUtils.degToRad(75)
        this.controls.enablePan = false
        this.controls.enableZoom = true
        const target = this.cameraConfig.target
        this.controls.target.set(target.x, target.y, target.z)
        this.controls.update()
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
            const keys = [
              'map', 'aoMap', 'emissiveMap', 'bumpMap',
              'normalMap', 'roughnessMap', 'metalnessMap',
              'alphaMap', 'displacementMap'
            ]
            keys.forEach(key => {
              const tex = mat[key]
              if (!tex) return
              const url = tex?.image?.src || ''
              if (!tex.image || unsupported.some(ext => url.endsWith(ext))) {
                console.warn(`[贴图移除] ${key} 格式不支持：${url}`)
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
            mat.needsUpdate = true
            return mat
          }

          fbx.traverse(child => {
            if (child.isMesh) {
              child.material = Array.isArray(child.material)
                ? child.material.map(sanitizeMaterial)
                : sanitizeMaterial(child.material)
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          fbx.traverse(child => {
            if (child.isMesh) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach(mat => {
                console.group(`材质: ${mat.name}`);
                ['map', 'aoMap', 'emissiveMap', 'normalMap'].forEach(key => {
                  console.log(key + ':', mat[key]?.image?.src || '无');
                });
                console.groupEnd();
              });
            }
          });

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

          // 初始化调试面板中的模型位置和缩放，保证显示一致
          this.modelPosition.x = fbx.position.x
          this.modelPosition.y = fbx.position.y
          this.modelPosition.z = fbx.position.z
          this.modelScale.x = fbx.scale.x
          this.modelScale.y = fbx.scale.y
          this.modelScale.z = fbx.scale.z

          if (this.autoCamera) this.fitCameraToObject()

          // 添加地面，使用传入的 groundSize
          if (this.groundTextureUrl) {
            this.addGroundPlane(this.groundSize)
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

    // 新增参数 groundSize 以便调试面板调用
    addGroundPlane(size) {
      const box = new THREE.Box3().setFromObject(this.modelGroup)
      const minY = box.min.y
      const loader = new THREE.TextureLoader()

      loader.load(this.groundTextureUrl, texture => {
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
        texture.flipY = false
        texture.encoding = THREE.sRGBEncoding
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() || 1
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearMipMapLinearFilter

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: false,
        })

        // 先移除旧底面（如果有）
        if (this.groundPlane) {
          this.modelGroup.remove(this.groundPlane)
          this.groundPlane.geometry.dispose()
          this.groundPlane.material.dispose()
          this.groundPlane = null
        }

        const geometry = new THREE.PlaneGeometry(size, size)
        const plane = new THREE.Mesh(geometry, material)
        plane.rotation.x = -Math.PI / 2
        plane.position.y = minY - 0.1
        plane.receiveShadow = false
        plane.userData.isGround = true

        this.modelGroup.add(plane)
        this.groundPlane = plane // 保存引用
      }, undefined, err => {
        console.error('地面贴图加载失败', err)
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

        // 同步调试面板
        this.cameraPosition.x = this.camera.position.x
        this.cameraPosition.y = this.camera.position.y
        this.cameraPosition.z = this.camera.position.z
        this.cameraTarget.x = this.controls.target.x
        this.cameraTarget.y = this.controls.target.y
        this.cameraTarget.z = this.controls.target.z
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

    // 新增方法，更新模型位置
    updateModelPosition() {
      if (this.model) {
        this.model.position.set(
          this.modelPosition.x,
          this.modelPosition.y,
          this.modelPosition.z
        )
      }
    },
    // 更新模型缩放
    updateModelScale() {
      if (this.model) {
        this.model.scale.set(
          this.modelScale.x,
          this.modelScale.y,
          this.modelScale.z
        )
      }
    },
    // 更新相机位置
    updateCameraPosition() {
      if (this.camera) {
        this.camera.position.set(
          this.cameraPosition.x,
          this.cameraPosition.y,
          this.cameraPosition.z
        )
        if (this.controls) {
          this.controls.update()
        }
      }
    },
    // 更新相机观测点（target）
    updateCameraTarget() {
      if (this.controls) {
        this.controls.target.set(
          this.cameraTarget.x,
          this.cameraTarget.y,
          this.cameraTarget.z
        )
        this.controls.update()
      }
    },
    // 更新地面大小
    updateGroundSize() {
      if (this.groundSize < 1) {
        this.groundSize = 1
      }
      this.addGroundPlane(this.groundSize)
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

.debug-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  max-width: 250px;
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.debug-panel h4 {
  margin: 0 0 5px;
  font-size: 14px;
}

.debug-panel section {
  margin-bottom: 8px;
}

.debug-panel label {
  display: block;
  margin: 2px 0;
}

.debug-panel input {
  width: 100%;
  padding: 2px 4px;
  font-size: 12px;
  box-sizing: border-box;
}
</style>
