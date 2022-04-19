/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean // 用户书写的render是true，自己编译的是false
): VNode | Array<VNode> {
  // 首先判断了data是否为数组或者基础类型，我们可以先看看_createElement里对data类型的限制，是一个VNode。
  // 如果判断为真，则表示data的这个位置放的是children，将会把之后的每一个参数重新纠正赋值
  // 做了一次处理， 当data为空的时候将后面的移上去
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement (
  context: Component, // 表示VNode的上下文环境
  tag?: string | Class<Component> | Function | Object, // 表示标签，可以是一个字符串，也可以是个component
  data?: VNodeData, // VNoded的数据
  children?: any, // 当前VNode的子节点
  normalizationType?: number// 表示子节点规范的类型
): VNode | Array<VNode> {
  // 如果data有值且为响应式对象，报错并返回空VNode。
  if (isDef(data) && isDef((data: any).__ob__)) {  //检测是否是响应式数据
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }
  // component is 动态渲染的时候
  // object syntax in v-bind
  // 如果data有is属性，则存为tag
  if (isDef(data) && isDef(data.is)) { //检测data中是否有is属性，是的话tag替换为is指向的内容，处理动态组件
    tag = data.is
  }
  // 没值的时候也创建一个空节点
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  // data 中的key如果定义了必须是数字或者字符串
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  /*
  标准化处理children的两种模式
  这里会根据normalizationType的值去获得children
  将一个多维数组处理成为一维数组
  一个场景是 render 函数是用户手写的，当 children 只有一个节点的时候，Vue.js 从接口层面允许用户把 children 写成基础类型用来创建单个简单的文本节点，
  这种情况会调用 createTextVNode 创建一个文本节点的 VNode。
  另一个场景是当编译 slot、v-for 的时候会产生嵌套数组的情况，会调用 normalizeArrayChildren 方法，遍历 children (可能会递归调用 normalizeArrayChildren )
  */
  if (normalizationType === ALWAYS_NORMALIZE) {
    // 手写render函数的时候 children应该是个数组
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // 调用场景是 render 函数是编译生成的。
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns
  // 在将children拍平为一维数组后，接着判断标签（tag）是不是字符串，是的话，则判断该标签是不是平台内建的标签（如：‘div’），是的话则创建该VNode。
  // 这里先对 tag 做判断，如果是 string 类型，则接着判断如果是内置的一些节点，则直接创建一个普通 VNode，如果是为已注册的组件名，则通过 createComponent 创建一个组件类型的 VNode，
  // 否则创建一个未知的标签的 VNode。 如果是 tag 一个 Component 类型，
  // 则直接调用 createComponent 创建一个组件类型的 VNode 节点。对于 createComponent 创建组件类型的 VNode 的过程，我们之后会去介绍，本质上它还是返回了一个 VNode。
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 判断是否是原生html标签
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      if (process.env.NODE_ENV !== 'production' && isDef(data) && isDef(data.nativeOn)) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      // 实例化一个普通的Vnode
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      //条件满足的话，创建一个组件VNode 此时不用再进行extend因为 通过resolveAssent
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // 不认识的节点 如果都不是，则按照该标签名创建一个VNode
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // 如果标签（tag）不是字符串，则创建组件VNode
    // 处理组件
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
