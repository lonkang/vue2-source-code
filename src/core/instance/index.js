import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // new Vue的时候就会调用这个函数 
  this._init(options)
}
initMixin(Vue) // 挂载_init方法
stateMixin(Vue) // 挂载$set $watch $delete方法
eventsMixin(Vue) // 挂载 $on $once $off $emit 方法
lifecycleMixin(Vue) // 挂载_update $fourceUpdate $destroy方法
renderMixin(Vue) // 挂载 nextTick _render方法

export default Vue
