/// <reference types="@nasl/types" />
namespace extensions.fbx_view.viewComponents {
  const { Component, Prop, ViewComponent, Slot, Method, Event, ViewComponentOptions } = nasl.ui;

  @ExtensionComponent({
    type: 'both',
    ideusage: {
      idetype: 'element',
    }
  })
  @Component({
    title: 'fbx展示器',
    description: 'fbx展示器',
  })
  export class FbxView extends ViewComponent {
    constructor(options?: Partial<FbxViewOptions>) {
      super();
    }
  }

  export class FbxViewOptions extends ViewComponentOptions {
    @Prop({
      title: 'fbx模型地址',
      description: 'url',
      setter: {
        concept: 'InputSetter'
      }
    })
    modelUrl: nasl.core.String = '';

    @Prop({
      title: '相机位置、观察目标点',
      description: '{position: { x: 10, y: 10, z: 10 },target: { x: 0, y: 0, z: 0 }},',
      sync: true,
      setter: {
        concept: 'InputSetter'
      }
    })
    cameraConfig: { position: { x: nasl.core.Integer, y: nasl.core.Integer, z: nasl.core.Integer }, target: { x: nasl.core.Integer, y: nasl.core.Integer, z: nasl.core.Integer } };

    @Prop({
      title: '背景色',
      description: '背景色',
      setter: {
        concept: 'InputSetter'
      }
    })
    backgroundColor: nasl.core.String = '';


    @Prop({
      title: '是否显示轨道控制器',
      description: '可拖拽滚动等',
      setter: {
        concept: 'SwitchSetter'
      }
    })
    showControls: nasl.core.Boolean = true;

    @Prop({
      title: '是否自动调整相机位置',
      description: '是否自动调整相机位置,开启后相机位置失效',
      setter: {
        concept: 'SwitchSetter'
      }
    })
    autoCamera: nasl.core.Boolean = false;

    @Prop({
      title: '底图url',
      description: '底图url',
      setter: {
        concept: 'InputSetter'
      }
    })
    groundTextureUrl: nasl.core.String = '';

    @Prop({
      title: '材质默认颜色',
      description: '材质默认颜色',
      setter: {
        concept: 'InputSetter'
      }
    })
    defaultMaterialColor: nasl.core.String = '';

    @Prop({
      title: '底图大小',
      description: '底图大小',
      setter: {
        concept: 'InputSetter'
      }
    })
    groundSize: nasl.core.Integer = 1000;

    @Event({
      title: '加载完成时',
      description: '加载完成时'
    })
    onFinish: (event: { finish: nasl.core.Boolean; }) => void;
  }
}