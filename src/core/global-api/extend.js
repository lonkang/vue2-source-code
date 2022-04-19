/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Vue.extend 的作用就是构造一个 Vue 的子类，
   * 它使用一种非常经典的原型继承的方式把一个纯对象转换一个继承于 Vue 的构造器 Sub 并返回，
   * 然后对 Sub 这个对象本身扩展了一些属性，如扩展 options、添加全局 API 等；
   * 并且对配置中的 props 和 computed 做了初始化工作；最后对于这个 Sub 构造函数做了缓存，
   * 避免多次执行 Vue.extend 的时候对同一个子组件重复构造。
   * 这样当我们去实例化 Sub 的时候，就会执行 this._init 逻辑再次走到了 Vue 实例的初始化逻辑
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this // vue
    const SuperId = Super.cid
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 做了一个缓存的优化 如果创建直接返回，
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }
    // 组件的name
    const name = extendOptions.name || Super.options.name
    // 检查组件的名字是否合法
    if (process.env.NODE_ENV !== 'production' && name) {
      // 在开发环境做了一层校验 判断是否是保留的标签
      // 判断传入的组件的名字使是否是满足条件
      // core/util/options.js
      validateComponentName(name)
    }
    // 使用原型继承进行扩展
    const Sub = function VueComponent (options) {
      // 执行到vue.prototype._init上
      this._init(options)
    }
    // 原型继承 
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 合并options
    Sub.options = mergeOptions(
      Super.options,
      extendOptions // 就是定义组件对象传递的参数
    )
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 将自身的props和computed进行初始化
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 继承到子组件
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // 将 component directive filter 这些函数复制给Sub
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // 这些目地就是和Vue有一样的能力
    // 如果有name就往自身上添加自己
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 将这个组件缓存下来
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  // 这么做的好处是不用为每个组件实例都做一层 proxy，是一种优化手段。
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
