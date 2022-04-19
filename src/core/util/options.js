/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
// 合并el props
/*
可以发现，el和propsData的合并就是采用了默认的合并策略(覆盖式)，但在非生产环境下，会多一步判断，
判断如果没有传vm参数则给出警告，el、propsData参数只能用于实例化。那根据vm就可以判断出是否是实例化时候调用的嘛？
这里是肯定的。前文我们提到过Vue.extend、Vue.mixin调用mergeOptions是不传入第三个参数的，
mergeOptions调用mergeField函数又会把vm传入进去，所以说vm没有传就为undefined，就可以说明不是实例化时调用的。
再说一点，用vm也可以判断出是否是处理子组件选项，因为子组件的实现方式是通过实例化子类完成的，而子类又是通过Vue.extend创造出来的。

*/
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */
// 将from的属性添加到to上，最后返回to
function mergeData (to: Object, from: ?Object): Object {
  // 如果没有from、直接返回to
  if (!from) return to
  let key, toVal, fromVal
  // 取到from的key值，用于遍历
  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // 对象被观察了，会有__ob__属性，__ob__不作处理
    // in case the object is already observed...
    if (key === '__ob__') continue
    toVal = to[key]
    fromVal = from[key]
    // 如果to上没有该属性，则直接将from对应的值赋值给to[key]
    if (!hasOwn(to, key)) {
      // 这里的set就是Vue.$set，先可以简单理解为对象设置属性
      set(to, key, fromVal)
    } else if (
      {
        /*
        如果from和to中有相同的key值，且key对应的value是对象，则会递归调用mergeData方法，否则以to的值为准，最后返回to对象。这里我们就讲完了data的合并策略。
返回mergeOptions代码里，在经过这几种合并策略合并options后，最终返回options
        */
        toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 没有vm参数，代表是用 Vue.extend、Vue.mixin合并
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    // 没有childVal返回parentVal
    if (!childVal) {
      return parentVal
    }
    // 没有parentVal返回childVal
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // 返回一个合并data函数
    return function mergedDataFn () {
      // 当调用mergedDataFn才会执行mergeData
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    // 返回一个合并data函数
    return function mergedInstanceDataFn () {
      // instance merge
      // 实例化合并，判断是否是函数，函数执行得到对象。
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      // 如果子选项data有值，则通过mergeData合并。
      // 当调用mergedInstanceDataFn才会执行mergeData
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}
// 合并data数据
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 没有vm参数，代表是用 Vue.extend、Vue.mixin合并
  if (!vm) {
    // 组件中data必须是函数
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * 只有父时返回父，只有子时返回数组类型的子。父、子都存在时，
 * 将子添加在父的后面返回组合而成的数组。
 * 这也是父子均有钩子函数的时候，先执行父的后执行子的的原因
 * Hooks and props are merged as arrays.
 */
// 逻辑就是如果不存在 childVal ，就返回 parentVal；
// 否则再判断是否存在 parentVal，如果存在就把 childVal
// 添加到 parentVal 后返回新数组；否则返回 childVal 的数组。
// 所以回到 mergeOptions 函数，
// 一旦 parent 和 child 都定义了相同的钩子函数，那么它们会把 2 个钩子函数合并成一个数组。
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
  return res
    ? dedupeHooks(res)
    : res
}

function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}
// 合并生命周期的钩子函数和props参数的方法为mergeHook
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 创建一个空对象，通过res.__proto__可以访问到parentVal
  const res = Object.create(parentVal || null)
  // 如果childVal有值，则校验childVal[key]是否是对象，不是给出警告。
  // extend函数是将childVal的属性添加到res上，
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}
// component、directive、filter
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
// 合并Watcher
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // Firefox浏览器自带watch，如果是原生watch，则置空
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  // 如果没有childVal，则创建返回空对象，通过__proto__可以访问parentVal
  if (!childVal) return Object.create(parentVal || null)
  // 非正式环境检验校验childVal[key]是否是对象，不是给出警告。
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  // 如果没有parentVal，返回childVal
  if (!parentVal) return childVal
  // parentVal和childVal都有值的情况
  const ret = {}
  // 把parentVal属性添加到ret
  extend(ret, parentVal)
  // 遍历childVal
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    // 如果parent存在，则变成数组
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    // 返回数组
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}


/**
 * Other object hashes.
 * 这个合并方法逻辑很简单，如果child options上这些属性存在，则先判断它们是不是对象。
（1）如果parent options上没有该属性，则直接返回child options上的该属性
（2）如果parent options和child options都有，则合并parent options和child options并生成一个新的对象。
(如果parent和child上有同名属性，合并后的以child options上的为准)
 */
// 合并 props methods inject computed
strats.props =
  strats.methods =
  strats.inject =
  strats.computed = function (
    parentVal: ?Object,
    childVal: ?Object,
    vm?: Component,
    key: string
  ): ?Object {
    // 非正式环境检验校验childVal[key]是否是对象，不是给出警告。
    if (childVal && process.env.NODE_ENV !== 'production') {
      assertObjectType(key, childVal, vm)
    }
    // 如果没有parentVal 返回childVal
    if (!parentVal) return childVal
    const ret = Object.create(null)
    // 将parentVal属性添加到ret
    extend(ret, parentVal)
    // 如果childVal有值，也将属性添加到ret
    if (childVal) extend(ret, childVal)
    return ret
  }

// 合并provide
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 */
// 默认策略就是：子组件的选项不存在，才会使用父组件的选项，如果子组件的选项存在，使用子组件自身的。
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
function checkComponents (options: Object) {
  // 遍历对象的components属性，依次检验
  for (const key in options.components) {
    validateComponentName(key)
  }
}

export function validateComponentName (name: string) {
  // 判断传入的组件的名字使是否是满足条件
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  // 如果是保留的html标签的话就报错 有冲突的情况下就会报错
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  // 1，如果是数组的情况，例如：['name', 'age']
  if (Array.isArray(props)) {
    i = props.length
    // 循环遍历变成对象格式 例如： {type: null}
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val) // 将key值变成驼峰形式
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) { // 2 是对象
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      // 如果是对象，则直接赋值，不是的话，则赋值type属性
      // 例如 { sex: String, job: { type: String, default: 'xxx' }
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // 不是数组和对象给出警告
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  // 重置对象，之后重新赋值属性
  const normalized = options.inject = {}
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      // 1. 数组情况，直接遍历。与normalizeProps同理
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    // 2. 对象情况。如果key值对应的是对象，则通过exntend合并，如果不是，则代表直接是from
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  // 遍历对象，如果key值对应的是函数。则修改成对象形式。
  // Vue提供了自定义指令的简写，如果只传函数，等同于{ bind: func, update: func }
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}
/*
  mergeOptions 主要功能就是把 parent 和 child 这两个对象根据一些合并策略，
  合并成一个新对象并返回。比较核心的几步，先递归把 extends 和 mixins 合并到 parent 上，
  然后遍历 parent，调用 mergeField，然后再遍历 child，如果 key 不在 parent 的自身属性上，
  则调用 mergeField。
*/
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child) // 检测函数名是否规范
  }

  // 检查传入的child是否是函数，如果是的话，取到它的options选项重新赋值给child。所以说child参数可以是普通选项对象，
  // 也可以是Vue构造函数和通过Vue.extend继承的子类构造函数。
  if (typeof child === 'function') {
    child = child.options
  }

  // 规范化选项 因为  props inject既可以是字符串数组，也可以是对象
  // directives既可以是函数，也可以是对象， vue在处理的时候需要规范成一样方便进行处理
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)

  // 处理原始 child 对象上的 extends 和 mixins，分别执行 mergeOptions，将这些继承而来的选项合并到 parent
  // 这里判断没有_base属性的话(被合并过不再处理，只有合并过的选项会带有_base属性)
  if (!child._base) {
    /*
    处理子选项的extend、mixins，处理方法就是将extend和mixins
    再通过mergeOptions函数与parent合并，
    因为mergeOptions函数合并后会返回新的对象，
    所以这时parent已经是个崭新的对象啦。
    */
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }
  // 定义options为空对象，最后函数返回结果是options
  const options = {}
  let key
  // 先遍历parent执行mergeField
  for (key in parent) {
    mergeField(key)
  }
  // 再遍历child，当parent没有key的时候，在执行mergeField。
  // 如果有key属性，就不需要合并啦，因为上一步已经合并到options上了
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  // mergeField函数它对不同的 key 有着不同的合并策略
  function mergeField (key) {
    const strat = strats[key] || defaultStrat
    // 值为如果 childVal 存在则优先使用 childVal，否则使用 parentVal
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean // 先不管
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  // 如果自身的属性下有这个id的话就直接返回
  if (hasOwn(assets, id)) return assets[id]
  // 讲Id转换为驼峰
  const camelizedId = camelize(id)
  // 通过驼峰去找
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  // 将id转换为首字母大写方式继续找
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // 还是找不到就直接通过原型上找
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  // 找到就直接返回，没找到就直接报错
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
