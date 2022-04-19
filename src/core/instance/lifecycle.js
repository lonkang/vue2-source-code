/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance (vm: Component) {
  const prevActiveInstance = activeInstance
  // 把当前实例给记录下来
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}
/*
initLifecycle：初始化一些属性如$parent，$children。
根实例没有 $parent，$children 开始是空数组，
直到它的 子组件 实例进入到 initLifecycle 时，才会往父组件的 $children 里把自身放进去。
所以 $children 里的一定是组件的实例。
*/
export function initLifecycle (vm: Component) {
  const options = vm.$options
  /*
  // patch的子组件的时候
  // 把当前激活的vm当作它的Vm实例
  // 这样子组件的初始化实际上就是在当前vm实例中初始化
  */
  // 建立父子关系
  // 此時的vm就是子组件
  // parent就是父组件的实例
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 把当前的vm实例push到parent中
    parent.$children.push(vm)
  }
  // 把vm.$parent指向parent
  vm.$parent = parent
  // 这样就建立了父子关系


  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // 组件的创建就是深度遍历的
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
    // 每次调用update的时候进行改变
    // 改变activeInstance
    const restoreActiveInstance = setActiveInstance(vm)
    // 为什么要改变activeInstance 因为在当前Vnode做patch的时候过程中 将当前实例的vm当作传给当前组件的子组件
    // 整个关系就建立了, 整个patch就是一个深度遍历,
    // 这样子组件initLifecycle的时候就可以拿到当前激活的vm实例
    // 例如 App组件一个生成的虚拟dom赋值给_vnode
    vm._vnode = vnode

    // update函数会在两个地方调用 ， 初始化渲染和数据更新 初始化的时候都是空
    // vm__patch__ 定义在src/platforms/web/runtime/index.js
    // 初始化渲染
    if (!prevVnode) {
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // 更新渲染
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    // 重置 activeInstance 形成父子关系方便遍历
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null) //  触发它子组件的销毁钩子函数，这样一层层的递归调用，所以 destroy 钩子函数执行顺序是先子后父，和 mounted 过程一样
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 子组件传递过来的进行render  // 做缓存
  vm.$el = el
  // 调用mountComponent之前会转换render函数
  // 如果没写rendre函数 template也没用转换render函数
  if (!vm.$options.render) {
    // 创建一共空的VNode
    vm.$options.render = createEmptyVNode
    // 警告 用了runtime-only 但是没有用render函数用了template所以报错
    // 也就是vue尝试猜测使用哪种方法报错的
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 在执行 vm._render() 函数渲染 VNode 之前，执行了 beforeMount 钩子函数
  // 执行beforeMount生命周期
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  // 如果当前环境是开发环境且config.performance和mark(性能埋点有关) 都有
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    // 拆解来看，vm._render 其实就是调用我们上一步拿到的 render 函数生成一个 vnode，
    // 而 vm._update 方法则会对这个 vnode 进行 patch 操作，帮我们把 vnode 通过 createElm函数创建新节点并且渲染到 dom节点中。
    updateComponent = () => {
      // 调用vm._render()生成虚拟DOM 生成虚拟dom的时候会在这个过程中对vm上的数据进行访问,这个时候就触发了数据对象的getter
      // 调用vm._update()进行更新
      vm._update(vm._render(), hydrating)
      // vm.__updata在src/core/instance/lifecycle.js
      // vm.__render在src/core/instance/render.js
    }
  }
  /*
  在此处的Watcher是一个渲染Watcher
  响应式原理 的一个核心类 Watcher 负责执行这个函数，为什么要它来代理执行呢？
  因为我们需要在这段过程中去 观察 这个函数读取了哪些响应式数据，将来这些响应式数据更新的时候，我们需要重新执行 updateComponent 函数。
  如果是更新后调用 updateComponent 函数的话，updateComponent 内部的 patch 就不再是初始化时候的创建节点，而是对新旧 vnode 进行 diff，最小化的更新到 dom节点 上去
  */
  new Watcher(vm, updateComponent, noop, {
    // 注意这里在before 属性上定义了beforeUpdate 函数，也就是说在 Watcher 被响应式属性的更新触发之后，重新渲染新视图之前，会先调用 beforeUpdate 生命周期。
    before () {
      // 只有组件已经mounted之后，才会调用这个钩子函数
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // 这里对 mounted 钩子函数执行有一个判断逻辑，vm.$vnode 如果为 null，则表明这不是一次组件的初始化过程，而是我们通过外部 new Vue 初始化过程
  if (vm.$vnode == null) {
    vm._isMounted = true
    // 在执行完 vm._update() 把 VNode patch 到真实 DOM 后，执行 mounted 钩子。
    callHook(vm, 'mounted')
  }
  return vm
}
// 拿到新的Vnode的组件配置以及组件实例
// updateChildComponent 的逻辑也非常简单，由于更新了 vnode，那么 vnode 对应的实例 vm 的一系列属性也会发生变化，包括占位符 vm.$vnode 的更新、slot 的更新，listeners 的更新，props 的更新等等。
export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  /*
  update props 更新props
  这里的 propsData 是父组件传递的 props 数据，
  vm 是子组件的实例。vm._props 指向的就是子组件的 props 值，propKeys 就是在之前 initProps 过程中，
  缓存的子组件中定义的所有 prop 的 key。主要逻辑就是遍历 propKeys，
  然后执行 props[key] = validateProp(key, 
  propOptions, propsData, vm) 重新验证和计算新的 prop 数据，
  更新 vm._props，也就是子组件的 props，这个就是子组件 props 的更新过程
  */
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      /*
      当执行 props[key] = validateProp(key, propOptions, propsData, vm) 更新子组件 prop 的时候，
      会触发 prop 的 setter 过程，只要在渲染子组件的时候访问过这个 prop 值，
      那么根据响应式原理，就会触发子组件的重新渲染。
      */
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}
// 生命周期函数最后执行的都是 callhook这个函数
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  // 在合并配置中的生命周期是个数组遍历数组并且执行
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
