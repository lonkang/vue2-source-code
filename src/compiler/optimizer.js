/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
/*
  我们在编译阶段可以把一些 AST 节点优化成静态节点，所以整个 optimize 的过程实际上就干 2 件事情，markStatic(root) 标记静态节点 ，markStaticRoots(root, false) 标记静态根。
*/
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  // 平台保留标签
  isPlatformReservedTag = options.isReservedTag || no
  // 遍历所有节点，给每个节点设置 static 属性，标识其是否为静态节点
  markStatic(root)

  // 进一步标记静态根，一个节点要成为静态根节点，需要具体以下条件：
  // 节点本身是静态节点，而且有子节点，而且子节点不只是一个文本节点，则标记为静态根
  // 静态根节点不能只有静态文本的子节点，因为这样收益太低，这种情况下始终更新它就好了
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}
/*
  isStatic 是对一个 AST 元素节点是否是静态的判断，如果是表达式，就是非静态；
  如果是纯文本，就是静态；对于一个普通元素，如果有 pre 属性，那么它使用了 v-pre 指令，是静态，
  否则要同时满足以下条件：没有使用 v-if、v-for，没有使用其它指令（不包括 v-once），非内置组件，
  是平台保留的标签，非带有 v-for 的 template 标签的直接子节点，节点的所有属性的 key 都满足静态 key；
  这些都满足则这个 AST 节点是一个静态节点。

  如果这个节点是一个普通元素，则遍历它的所有 children，递归执行 markStatic。
  因为所有的 elseif 和 else 节点都不在 children 中，
  如果节点的 ifConditions 不为空，则遍历 ifConditions 拿到所有条件中的 block，
  也就是它们对应的 AST 节点，递归执行 markStatic。
  在这些递归过程中，一旦子节点有不是 static 的情况，则它的父节点的 static 均变成 false。
*/
/**
 * 在所有节点上设置 static 属性，用来标识是否为静态节点
 * 注意：如果有子节点为动态节点，则父节点也被认为是动态节点
 * @param {*} node
 * @returns
 */
function markStatic (node: ASTNode) {
  // 通过 node.static 来标识节点是否为 静态节点
  node.static = isStatic(node)
  if (node.type === 1) {
    /**
    * 不要将组件的插槽内容设置为静态节点，这样可以避免：
    *   1、组件不能改变插槽节点
    *   2、静态插槽内容在热重载时失败
    */
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      // 递归终止条件，如果节点不是平台保留标签  && 也不是 slot 标签 && 也不是内联模版，则直接结束
      return
    }
    // 遍历子节点，递归调用 markStatic 来标记这些子节点的 static 属性
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        // 如果子节点是非静态节点，则将父节点更新为非静态节点
        node.static = false
      }
    }
    // 如果节点存在 v-if、v-else-if、v-else 这些指令，则依次标记 block 中节点的 static
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

/**
 * 进一步标记静态根，一个节点要成为静态根节点，需要具体以下条件：
 * 节点本身是静态节点，而且有子节点，而且子节点不只是一个文本节点，则标记为静态根
 * 静态根节点不能只有静态文本的子节点，因为这样收益太低，这种情况下始终更新它就好了
 *
 * @param { ASTElement } node 当前节点
 * @param { boolean } isInFor 当前节点是否被包裹在 v-for 指令所在的节点内
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      // 节点是静态的 或者 节点上有 v-once 指令，标记 node.staticInFor = true or false
      node.staticInFor = isInFor
    }

    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 节点本身是静态节点，而且有子节点，而且子节点不只是一个文本节点，则标记为静态根 => node.staticRoot = true，否则为非静态根
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 当前节点不是静态根节点的时候，递归遍历其子节点，标记静态根
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 如果节点存在 v-if、v-else-if、v-else 指令，则为 block 节点标记静态根
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/**
 * 判断节点是否为静态节点：
 *  通过自定义的 node.type 来判断，2: 表达式 => 动态，3: 文本 => 静态
 *  凡是有 v-bind、v-if、v-for 等指令的都属于动态节点
 *  组件为动态节点
 *  父节点为含有 v-for 指令的 template 标签，则为动态节点
 * @param {*} node
 * @returns boolean
 *
  */
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
