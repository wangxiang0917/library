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
  </div>
</template>

<script>
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

export default {
  name: 'FbxViewer',
  props: {
    modelUrl: { type: String, required: true, default: 'https://edu-20230301.oss-cn-beijing.aliyuncs.com/%211RUBIXCUBE.fbx' }, // 模型地址
    groundTextureUrl: { type: String, default: 'https://img1.baidu.com/it/u=1029958023,1900764162&fm=253&fmt=auto&app=138&f=JPEG?w=889&h=500' }, // 地图贴图地址
    backgroundColor: { type: String, default: '#f0f0f0' }, // 场景背景色
    showControls: { type: Boolean, default: true }, // 是否启用控制器
    autoCamera: { type: Boolean, default: false }, // 是否自动调整相机
    groundSize: { type: Number, default: 1000 }, // ✅ 新增地面正方形尺寸
    cameraConfig: {
      type: Object,
      default: () => ({
        position: { x: 50, y: 30, z: 50 }, // 初始相机位置
        target: { x: 0, y: 0, z: 0 } // 相机看向的目标
      })
    }
  },
  data() {
    return {
      scene: null,
      camera: null,
      renderer: null,
      controls: null,
      modelGroup: null, // 用于装载模型和辅助元素的组
      model: null, // 模型对象

      raycaster: new THREE.Raycaster(), // 用于鼠标拾取
      mouse: new THREE.Vector2(), // 鼠标位置
      hoverName: '', // 悬浮显示的名称
      labelPosition: new THREE.Vector3(), // 标签位置
      selectedMesh: null, // 当前高亮的 mesh

      loading: true, // 加载状态
      loadingProgress: 0 // 加载进度
    }
  },
  computed: {
    // 标签样式（用于屏幕上的名称浮层定位）
    labelStyle() {
      const pos = this.labelPosition.clone()
      pos.project(this.camera) // 将3D坐标转为2D屏幕坐标

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
    this.initThreeJS() // 初始化 ThreeJS 场景
    this.loadModel() // 加载 FBX 模型

    window.addEventListener('resize', this.handleResize)
    this.$refs.container.addEventListener('mousemove', this.onHover)
  },
  beforeDestroy() {
    this.cleanup() // 卸载渲染器
    window.removeEventListener('resize', this.handleResize)
    this.$refs.container.removeEventListener('mousemove', this.onHover)
  },
  methods: {
    // 初始化 ThreeJS 场景
    initThreeJS() {
      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(this.backgroundColor)

      // 创建相机
      const w = this.$refs.container.clientWidth
      const h = this.$refs.container.clientHeight
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000)
      this.camera.position.set(
        this.cameraConfig.position.x,
        this.cameraConfig.position.y,
        this.cameraConfig.position.z
      )

      // 渲染器设置
      this.renderer = new THREE.WebGLRenderer({ antialias: true })
      this.renderer.setSize(w, h)
      this.renderer.setPixelRatio(window.devicePixelRatio)
      this.$refs.container.appendChild(this.renderer.domElement)

      // 添加灯光
      this.scene.add(new THREE.AmbientLight(0x666666))
      const dirLight = new THREE.DirectionalLight(0xffffff, 3)
      dirLight.position.set(100, 200, 100)
      this.scene.add(dirLight)

      // 创建模型容器组
      this.modelGroup = new THREE.Group()
      this.scene.add(this.modelGroup)

      // 添加辅助工具
      this.scene.add(new THREE.AxesHelper(1000)) // 坐标轴
      // this.scene.add(new THREE.GridHelper(2000, 200)) // 网格

      // 添加控制器
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

      // 启动渲染循环
      this.animate()
    },

    // 加载 FBX 模型
    loadModel() {
      const loader = new FBXLoader()
      loader.load(
        this.modelUrl,
        fbx => {
          // 材质贴图处理函数
          const sanitizeMaterial = mat => {
            if (!mat || !mat.isMaterial) return mat
            const unsupported = ['.dds', '.exr'] // 不支持格式
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

            // 保证颜色能显示
            if (!mat.map && mat.color) {
              mat.colorWrite = true
              mat.needsUpdate = true
            }

            mat.side = THREE.DoubleSide
            mat.needsUpdate = true
            return mat
          }

          // 处理每个 Mesh 的材质
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

          // 自动旋转方向（根据最小轴）
          const box = new THREE.Box3().setFromObject(fbx)
          const size = box.getSize(new THREE.Vector3())
          const dims = [size.x, size.y, size.z]
          const minIndex = dims.indexOf(Math.min(...dims))
          if (minIndex === 0) fbx.rotation.z = Math.PI / 2
          if (minIndex === 2) fbx.rotation.x = -Math.PI / 2

          // 模型贴地
          box.setFromObject(fbx)
          fbx.position.y = -box.min.y

          this.model = fbx
          this.modelGroup.add(fbx)

          if (this.autoCamera) this.fitCameraToObject()

          // 添加地面
          if (this.groundTextureUrl) {
            const groundSize = Math.max(size.x, size.z) * 1.2
            this.addGroundPlane(groundSize)
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
    // 添加地面贴图
    addGroundPlane() {
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

        // ✅ 使用传入的 groundSize 作为正方形边长
        const size = this.groundSize
        const geometry = new THREE.PlaneGeometry(size, size)

        const plane = new THREE.Mesh(geometry, material)
        plane.rotation.x = -Math.PI / 2
        plane.position.y = minY - 0.1
        plane.receiveShadow = false
        plane.userData.isGround = true

        this.modelGroup.add(plane)
      }, undefined, err => {
        console.error('地面贴图加载失败', err)
      })
    },
    // 自动适配相机视角
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

    // 鼠标 Hover 高亮
    onHover(event) {
      const rect = this.$refs.container.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      this.raycaster.setFromCamera(this.mouse, this.camera)
      const intersects = this.raycaster.intersectObjects(this.modelGroup.children, true)

      if (intersects.length > 0) {
        const mesh = intersects[0].object

        // ✅ 忽略地面贴图的 hover 效果
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
    // 渲染循环
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

    // 窗口大小变化时更新
    handleResize() {
      const w = this.$refs.container.clientWidth
      const h = this.$refs.container.clientHeight
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
    },

    // 卸载渲染器
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
</style>
