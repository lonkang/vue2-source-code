/* @flow */

import { toArray } from '../util/index'
/*
 Vue.use 接受一个 plugin 参数，并且维护了一个 _installedPlugins 数组，
 它存储所有注册过的 plugin；接着又会判断 plugin 有没有定义 install 方法，
 如果有的话则调用该方法，并且该方法执行的第一个参数是 Vue；
 最后把 plugin 存储到 installedPlugins 中。

可以看到 Vue 提供的插件注册机制很简单，每个插件都需要实现一个静态的 install 方法，
当我们执行 Vue.use 注册插件的时候，就会执行这个 install 方法，
并且在这个 install 方法的第一个参数我们可以拿到 Vue 对象，这样的好处就是作为插件的编写方不需要再额外去import Vue 了
 */
export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // 存储插件的数组
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 如果存储过就直接返回
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      // 执行install函数
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}

