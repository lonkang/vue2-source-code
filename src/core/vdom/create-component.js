/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // keep -alive 有关
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 通过 createComponentInstanceForVnode 创建一个 Vue 的实例，然后调用 $mount 方法挂载子组件
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode, // 当前vNode节点
        activeInstance // 当前vm的实例
      )
      // 因为子组件是没有el的所以手动调用了$mount hydrating为false 传入的Cnode.ele 为 undefined
      // 走自己定义的mount方法再走共有的方法 最终调用 render进行生成VNode 再调用patch
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },
  // prepatch 方法就是拿到新的 vnode 的组件配置以及组件实例，去执行 updateChildComponent 方法,它的定义在 src/core/instance/lifecycle.js 中
  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    // 在生成Vnode的时候会获取prosData放在componentOptions中
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      // 组件的挂载
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  // 如果Ctor传递为空就返回
  if (isUndef(Ctor)) {
    return
  }
  // 在初始化的时候合并options 在global-api中把Vue赋值给_base
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // global.js中的extend进行继承， vue.extend
  if (isObject(Ctor)) {
    // global-api/extend.js中
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 如果传递进来的组件不是一个函数的话就报错
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }
  // 异步组件有关
  // async component
  let asyncFactory
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    // 如果是第一次执行 resolveAsyncComponent，除非使用高级异步组件 0 delay 去创建了一个 loading 组件，否则返回是 undefiend，接着通过 createAsyncPlaceholder 创建一个注释节点作为占位符。
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 第一次还在加载的时候，
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 对options重新计算, 因为可能会被全局的 mixins给影响
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 对组件上面的v-model进行处理
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props 对props进行处理 取出propsData
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component 对函数组件的处理
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 对自定义事件的处理
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  // 如果此时在组件上有dom事件的话就自定义事件赋值给listeners, 组件上的dom事件赋值给data.on上
  data.on = data.nativeOn
  // 对抽象组件的处理
  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 安装组件hooks :init perpatch insert destory
  installComponentHooks(data)

  // return a placeholder vnode
  // Ctor就是组件的构造器
  const name = Ctor.options.name || tag
  // 生成Vnode 和之前的Vnode不一样, 传递的参数不一样
  // 然后在 new VNode 的时候，作为第七个参数 VNodeComponentOptions 中的一个属性传入，所以我们可以通过 vnode.componentOptions.propsData 拿到 prop 数据。
  const vnode = new VNode(
    // 传入这个参数就代表是个组件 组件的Vnode.children是空 传递了componentOptions
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}
// 返回子组件的vm实例
export function createComponentInstanceForVnode (
  // we know it's MountedComponentVNode but flow doesn't
  vnode: any, // 组件的Vnode
  // activeInstance in lifecycle state
  parent: any // 实际上就是当前vm的实例
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent // 子组件的父节点实例 例如<App></App>组件上面的body
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // global-api/extend.js中

  // 因为组件通过extend这个API扩展
  // 实际上执行了 Sub这个函数调用了 _init这个方法
  // 因为子组件继承了父组件最终执行了vue.prototype._init这个方法 进行一系列的初始化操作
  // 返回子组件的vm实例
  return new vnode.componentOptions.Ctor(options)
}
// 将组件中的钩子函数和data中的钩子函数进行合并, 本质上是让组件拥有 init prePatch insert  destory 这些钩子函数
// 让组件进行patch的时候去执行对应的钩子函数
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
    ; (data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
