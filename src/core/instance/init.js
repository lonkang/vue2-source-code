/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }
    vm._isVue = true
    // 处理组件配置项
    if (options && options._isComponent) {
      /**
      * 每个子组件初始化时走这里，这里只做了一些性能优化
      * 将组件配置对象上的一些深层次属性放到 vm.$options 选项中，以提高代码的执行效率
      */
      initInternalComponent(vm, options)
    } else {
      // mergeOptions 在util/options.js中
      /**
        * 把大Vue上面的options复制给vm.options
        * 初始化根组件时走这里，合并 Vue 的全局配置到根组件的局部配置，比如 Vue.component 注册的全局组件会合并到 根实例的 components 选项中
        * 至于每个子组件的选项合并则发生在两个地方：
        *   1、Vue.component 方法注册的全局组件在注册时做了选项合并
        *   2、{ components: { xx } } 方式注册的局部组件在执行编译器生成的 render 函数时做了选项合并，包括根组件中的 components 配置
     */
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // 返回的是Vue.constructor.options 是在 global-api中的index定义的
        options || {}, // 用户自己new vue传递的值
        vm
      )
    }
    // 判断在生产环境 就直接把vm赋值给_renderProxy 不是的话就调用InitProxy
    if (process.env.NODE_ENV !== 'production') {
      // 设置代理，将 vm 实例上的属性代理到 vm._renderProxy
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    vm._self = vm
    // Vue 初始化主要就干了几件事情，合并配置，初始化生命周期，初始化事件中心，初始化渲染，初始化 data、props、computed、watcher 等等。
    initLifecycle(vm)  // 解析组件配置项上的 provide 对象，将其挂载到 vm._provided 属性上
    initEvents(vm) // 初始化事件相关的属性
    initRender(vm)  // 解析组件配置项上的 provide 对象，将其挂载到 vm._provided 属性上
    callHook(vm, 'beforeCreate') // 开始执行beforeCreate生命周期
    initInjections(vm)   // 初始化组件的 inject 配置项，得到 result[key] = val 形式的配置对象，然后对结果数据进行响应式处理，并代理每个 key 到 vm 实例
    initState(vm) // 初始化会被使用到的状态， 状态包括：props, methods, data, computed, watch
    initProvide(vm)  // 解析组件配置项上的 provide 对象，将其挂载到 vm._provided 属性上
    callHook(vm, 'created') // 执行created生命周期

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // 当此时的vm实例是组件的时候是不会进行挂载的 返回子组件的vm实例
    // 传入字符串才会进行挂载
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 原型继承
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode // 占位节点 也就是App组件生成的虚拟dom节点
  opts.parent = options.parent // 子组件的父级节点刚进来就是Vue实例
  opts._parentVnode = parentVnode // 讲组件生成的Vnode作为占位节点

  // 复制一些属性给opts
  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  // 获取到自定义事件的值赋值给￥options
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 解决全局mixins并且是在组件初始化的时候调用的
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  // 初始化的时候 Vue没有super
  if (Ctor.super) {
    // 存在基类，递归解析基类构造函数的选项
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // 存在基类，递归解析基类构造函数的选项
      Ctor.superOptions = superOptions
      // 检查 Ctor.options 上是否有任何后期修改/附加的选项（＃4976）
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // 如果存在被修改或增加的选项，则合并两个选项
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 选项合并，将合并结果赋值为 Ctor.options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

/**
 * 解析构造函数选项中后续被修改或者增加的选项
 */
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  // 构造函数选项
  const latest = Ctor.options
  // 密封的构造函数选项，备份
  const sealed = Ctor.sealedOptions
  // 对比两个选项，记录不一致的选项
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}

