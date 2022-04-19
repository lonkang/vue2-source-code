/* @flow */

import config from "../config";
import Watcher from "../observer/watcher";
import Dep, { pushTarget, popTarget } from "../observer/dep";
import { isUpdatingChildComponent } from "./lifecycle";

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving,
} from "../observer/index";

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
} from "../util/index";

const sharedPropertyDefinition = {
  enumerable: true, // 出现在可枚举属性中
  configurable: true, // 能够进行修改
  get: noop,
  set: noop,
};
/*
proxy 方法的实现很简单，通过 Object.defineProperty
把 target[sourceKey][key] 的读写变成了对 target[key] 的读写。
所以对于 props 而言，对 vm._props.xxx 的读写变成了 vm.xxx 的读写，
而对于 vm._props.xxx 我们可以访问到定义在 props 中的属性，
所以我们就可以通过 vm.xxx 访问到定义在 props 中的 xxx 属性了。
同理，对于 data 而言，对 vm._data.xxxx 的读写变成了对 vm.xxxx 的读写，而对于 vm._data.xxxx
我们可以访问到定义在 data 函数返回对象中的属性，所以我们就可以通过 vm.xxxx 访问到定义在 data 函数返回对象中的 xxxx 属性了。
*/
// 代理
export function proxy(target: Object, sourceKey: string, key: string) {
  // 定义get访问到对应的sourceKey
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key];
  };
  // 定义set访问到对应的sourceKey
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val;
  };
  // 给传入的vm中的选项做代理
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

export function initState(vm: Component) {
  vm._watchers = [];
  const opts = vm.$options;
  // 处理 props 对象，为 props 对象的每个属性设置响应式，并将其代理到 vm 实例上
  if (opts.props) initProps(vm, opts.props);
  // 处理 methos 对象，校验每个属性的值是否为函数、和 props 属性比对进行判重处理，最后得到 vm[key] = methods[key]
  if (opts.methods) initMethods(vm, opts.methods);
  if (opts.data) {
    /**
     * 做了三件事
     *   1、判重处理，data 对象上的属性不能和 props、methods 对象上的属性相同
     *   2、代理 data 对象上的属性到 vm 实例
     *   3、为 data 对象的上数据设置响应式
     */
    initData(vm);
  } else {
    observe((vm._data = {}), true /* asRootData */);
  }
  /**
   * 三件事：
   *   1、为 computed[key] 创建 watcher 实例，默认是懒执行
   *   2、代理 computed[key] 到 vm 实例
   *   3、判重，computed 中的 key 不能和 data、props 中的属性重复
   */
  if (opts.computed) initComputed(vm, opts.computed);
  /**
   * 三件事：
   *   1、处理 watch 对象
   *   2、为 每个 watch.key 创建 watcher 实例，key 和 watcher 实例可能是 一对多 的关系
   *   3、如果设置了 immediate，则立即执行 回调函数
   */
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch);
  }
  /**
   * 其实到这里也能看出，computed 和 watch 在本质是没有区别的，都是通过 watcher 去实现的响应式
   * 非要说有区别，那也只是在使用方式上的区别，简单来说：
   *   1、watch：适用于当数据变化时执行异步或者开销较大的操作时使用，即需要长时间等待的操作可以放在 watch 中
   *   2、computed：其中可以使用异步方法，但是没有任何意义。所以 computed 更适合做一些同步计算
   */
}
/*
initProps 主要做 3 件事情：校验、响应式和代理
遍历的过程主要做两件事情：
一个是调用 defineReactive 方法把每个 prop 对应的值变成响应式，可以通过 vm._props.xxx 访问到定义 props 中对应的属性
另一个是通过 proxy 把 vm._props.xxx 的访问代理到 vm.xxx 上
*/
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}; // 获取传递的props
  const props = (vm._props = {});
  // 缓存 props 的每个 key，性能优化
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = (vm.$options._propKeys = []); //用于保存当前组件的props里的key   ;以便之后在父组件更新props时可以直接使用数组迭代，而不需要动态枚举键值
  const isRoot = !vm.$parent;
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false);
  }
  // 遍历 props 对象
  for (const key in propsOptions) {
    keys.push(key);
    //执行validateProp检查propsData里的key值是否符合propsOptions里对应的要求，并获取 props[key] 的默认值
    const value = validateProp(key, propsOptions, propsData, vm);
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      const hyphenatedKey = hyphenate(key);
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        );
      }
      // 为 props 的每个 key 是设置数据响应式
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm
          );
        }
      });
    } else {
      defineReactive(props, key, value);
    } //将key变成响应式，同时也定义了props的key属性的值为value
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      // 代理 key 到 vm 对象上
      proxy(vm, `_props`, key);
    }
  }
  toggleObserving(true);
}

/**
 * 做了三件事
 *   1、判重处理，data 对象上的属性不能和 props、methods 对象上的属性相同
 *   2、代理 data 对象上的属性到 vm 实例
 *   3、为 data 对象的上数据设置响应式
 */
function initData(vm: Component) {
  // 如果定义了data就获取这个data
  let data = vm.$options.data;
  // vm._data 和 data都被赋值
  data = vm._data =
    typeof data === "function"
      ? getData(data, vm) // 转换数据 如果数据是一个函数的时候，执行这个函数拿到数据
      : data || {}; // 直接获取数据
  if (!isPlainObject(data)) {
    data = {};
    // 判断如果data不是函数就警告
    process.env.NODE_ENV !== "production" &&
      warn(
        "data functions should return an object:\n" +
          "https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function",
        vm
      );
  }
  /**
   * 两件事
   *   1、判重处理，data 对象上的属性不能和 props、methods 对象上的属性相同
   *   2、代理 data 对象上的属性到 vm 实例
   */
  const keys = Object.keys(data);
  const props = vm.$options.props;
  const methods = vm.$options.methods;
  let i = keys.length;
  while (i--) {
    const key = keys[i];
    if (process.env.NODE_ENV !== "production") {
      //如果数据中的key与事件中的key一样则发出警告
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        );
      }
    }
    if (props && hasOwn(props, key)) {
      //如果数据中的key与props属性中的key一样则发出警告
      process.env.NODE_ENV !== "production" &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        );
    } else if (!isReserved(key)) {
      // 如果不是以$或者_开头
      proxy(vm, `_data`, key); // 代理
    }
  }
  // 为 data 对象上的数据设置响应式
  observe(data, true /* asRootData */);
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget();
  try {
    return data.call(vm, vm); // 改变this的指向， 并且执行他
  } catch (e) {
    handleError(e, vm, `data()`);
    return {};
  } finally {
    popTarget();
  }
}

const computedWatcherOptions = { lazy: true };

/**
 * 三件事：
 *   1、为 computed[key] 创建 watcher 实例，默认是懒执行
 *   2、代理 computed[key] 到 vm 实例
 *   3、判重，computed 中的 key 不能和 data、props 中的属性重复
 * @param {*} computed = {
 *   key1: function() { return xx },
 *   key2: {
 *     get: function() { return xx },
 *     set: function(val) {}
 *   }
 * }
 */
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null));
  // computed properties are just getters during SSR
  const isSSR = isServerRendering();
  // 循环用户书写的计算属性
  for (const key in computed) {
    // 获取到用户的计算属性
    const userDef = computed[key];
    const getter = typeof userDef === "function" ? userDef : userDef.get;
    if (
      process.env.NODE_ENV !== "productidefineComputed on" &&
      getter == null
    ) {
      warn(`Getter is missing for computed property "${key}".`, vm);
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 每一个computed都创建一个watcher
      // 创建一个计算watcher，判断是否需要重新计算
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        // 配置项，computed 默认是懒执行
        computedWatcherOptions
      );
      /*
      1每个 computed 配发 watcher
      computed 到底和 watcher 有什么猫腻呢？

      1、保存 computed 计算函数

      2、保存计算结果

      3、控制缓存计算结果是否有效
      */
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 判断是否有重名的属性， 当重新进行渲染的时候 上次v初始化的时候已经有了，就不会再进行出来
    if (!(key in vm)) {
      // 代理 computed 对象中的属性到 vm 实例
      // 这样就可以使用 vm.computedKey 访问计算属性了
      defineComputed(vm, key, userDef);
    } else if (process.env.NODE_ENV !== "production") {
      // 非生产环境有一个判重处理，computed 对象中的属性不能和 data、props 中的属性相同
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm);
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(
          `The computed property "${key}" is already defined as a prop.`,
          vm
        );
      }
    }
  }
}
/*
1使用 Object.defineProperty 在 实例上computed 属性，所以可以直接访问

2set 函数默认是空函数，如果用户设置，则使用用户设置

3createComputedGetter 包装返回 get 函数
*/
export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering();
  if (typeof userDef === "function") {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef);
    // 设置 set 为默认值，避免 computed 并没有设置 set
    sharedPropertyDefinition.set = noop;
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    //  如果用户设置了set，就使用用户的set
    sharedPropertyDefinition.set = userDef.set || noop;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    sharedPropertyDefinition.set === noop
  ) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      );
    };
  }
  /*
  这段逻辑很简单，其实就是利用 Object.defineProperty 给计算属性对应的 key 值添加 getter 和 setter，setter 通常是计算属性是一个对象，并且拥有 set 方法的时候才有，否则是一个空函数。在平时的开发场景中，计算属性有 setter 的情况比较少，我们重点关注一下 getter 部分，缓存的配置也先忽略，最终 getter 对应的是 createComputedGetter(key) 的返回值
  */
  Object.defineProperty(target, key, sharedPropertyDefinition);
}
/**
 * @returns 返回一个函数，这个函数在访问 vm.computedProperty 时会被执行，然后返回执行结果
  // 执行updateComponent之后执行vm._render函数在生成的render函数中会触发用户写的计算属性函数，然后触发到此函数
 *
 */
function createComputedGetter(key) {
  // computed 属性值会缓存的原理也是在这里结合 watcher.dirty、watcher.evalaute、watcher.update 实现的
  return function computedGetter() {
    // 获取到相应 key 的 computed-watcher
    const watcher = this._computedWatchers && this._computedWatchers[key];
    if (watcher) {
      // 如果 computed 依赖的数据变化，dirty 会变成true，从而重新计算，然后更新缓存值 watcher.value
      /*
      因为在初始化计算属性wathcer的时候 设置dirty = true，所以会执行wathcer.evaluate()
      触发wathcer.get()执行pushTarget(this)将计算属性wathcer设置为Dep.terget,
      然后执行this.getter执行到用户书写的计算属性函数，因为计算属性会访问到响应式数据所以会触发响应式数据的get
      在此时Dep.terget是计算属性wathcer，会执行 dep.depend()函数，也就是计算属性watcher订阅了响应式数据，响应式数据的dep收集到了订阅者Wathcer
      订阅完成之后，会popTarget把Dep.target置为当前的渲染wathcer，再执行this.cleanupDeps()进行清理，再将dirty设置为false
      此时的Dep.target就是渲染watcher,执行watcher.depend()，循环计算属性 wathcer的deps，也就是依赖的响应式数据，然后调用dep[i].depend
      调用Dep.target.addDep(this)也就是渲染wathcer将当前依赖的响应式数据的dep进行添加订阅，然后dep收集到当前渲染wathcer
      最终返回获取到的value显示在页面中
      这就是computed依赖收集的完整过程，对比data的依赖收集，computed会对运算的结果进行缓存，避免重复执行运算过程。
      */

      // 计算 key 对应的值，通过执行 computed.key 的回调函数来得到
      // watcher.dirty 属性就是大家常说的 computed 计算结果会缓存的原理
      // <template>
      //   <div>{{ computedProperty }}</div>
      //   <div>{{ computedProperty }}</div>
      // </template>
      // 像这种情况下，在页面的一次渲染中，两个 dom 中的 computedProperty 只有第一个
      // 会执行 computed.computedProperty 的回调函数计算实际的值，
      // 即执行 watcher.evalaute，而第二个就不走计算过程了，
      // 因为上一次执行 watcher.evalute 时把 watcher.dirty 置为了 false，
      // 待页面更新后，wathcer.update 方法会将 watcher.dirty 重新置为 true，
      // 供下次页面更新时重新计算 computed.key 的结果

      if (watcher.dirty) {
        // 执行用户手写的函数进行求值
        watcher.evaluate();
      }
      if (Dep.target) {
        // 依赖收集
        watcher.depend();
      }
      return watcher.value;
    }
  };
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this);
  };
}

/**
 * 做了以下三件事，其实最关键的就是第三件事情
 *   1、校验 methoss[key]，必须是一个函数
 *   2、判重
 *         methods 中的 key 不能和 props 中的 key 相同
 *         methos 中的 key 与 Vue 实例上已有的方法重叠，一般是一些内置方法，比如以 $ 和 _ 开头的方法
 *   3、将 methods[key] 放到 vm 实例上，得到 vm[key] = methods[key]
 */
function initMethods(vm: Component, methods: Object) {
  // 获取 props 配置项
  const props = vm.$options.props;
  // 遍历 methods 对象
  for (const key in methods) {
    if (process.env.NODE_ENV !== "production") {
      if (typeof methods[key] !== "function") {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        );
      }
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm);
      }
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        );
      }
    }
    vm[key] =
      typeof methods[key] !== "function" ? noop : bind(methods[key], vm);
  }
}
/**
 * 处理 watch 对象的入口，做了两件事：
 *   1、遍历 watch 对象
 *   2、调用 createWatcher 函数
 * @param {*} watch = {
 *   'key1': function(val, oldVal) {},
 *   'key2': 'this.methodName',
 *   'key3': {
 *     handler: function(val, oldVal) {},
 *     deep: true
 *   },
 *   'key4': [
 *     'this.methodNanme',
 *     function handler1() {},
 *     {
 *       handler: function() {},
 *       immediate: true
 *     }
 *   ],
 *   'key.key5' { ... }
 * }
 */
function initWatch(vm: Component, watch: Object) {
  // 遍历 watch 对象
  for (const key in watch) {
    const handler = watch[key];
    if (Array.isArray(handler)) {
      // handler 为数组，遍历数组，获取其中的每一项，然后调用 createWatcher
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}
/**
 * 两件事：
 *   1、兼容性处理，保证 handler 肯定是一个函数
 *   2、调用 $watch
 * @returns
 */
function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 如果 handler 为对象，则获取其中的 handler 选项的值
  if (isPlainObject(handler)) {
    options = handler;
    handler = handler.handler;
  }
  // 如果 hander 为字符串，则说明是一个 methods 方法，获取 vm[handler]
  if (typeof handler === "string") {
    handler = vm[handler];
  }
  return vm.$watch(expOrFn, handler, options);
}

export function stateMixin(Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {};
  dataDef.get = function () {
    return this._data;
  };
  const propsDef = {};
  propsDef.get = function () {
    return this._props;
  };
  if (process.env.NODE_ENV !== "production") {
    dataDef.set = function () {
      warn(
        "Avoid replacing instance root $data. " +
          "Use nested data properties instead.",
        this
      );
    };
    propsDef.set = function () {
      warn(`$props is readonly.`, this);
    };
  }
  Object.defineProperty(Vue.prototype, "$data", dataDef);
  Object.defineProperty(Vue.prototype, "$props", propsDef);

  Vue.prototype.$set = set;
  Vue.prototype.$delete = del;

  /**
   * 创建 watcher，返回 unwatch，共完成如下 5 件事：
   *   1、兼容性处理，保证最后 new Watcher 时的 cb 为函数
   *   2、标示用户 watcher
   *   3、创建 watcher 实例
   *   4、如果设置了 immediate，则立即执行一次 cb
   *   5、返回 unwatch
   * @param {*} expOrFn key
   * @param {*} cb 回调函数
   * @param {*} options 配置项，用户直接调用 this.$watch 时可能会传递一个 配置项
   * @returns 返回 unwatch 函数，用于取消 watch 监听
   */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this;
    // 兼容性处理，因为用户调用 vm.$watch 时设置的 cb 可能是对象
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options);
    }
    // options.user 表示用户 watcher，还有渲染 watcher，即 updateComponent 方法中实例化的 watcher
    options = options || {};
    options.user = true;
    // 生成watch watcher
    const watcher = new Watcher(vm, expOrFn, cb, options);
    // 如果immediaate为true,立即调用回调函数
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value);
      } catch (error) {
        handleError(
          error,
          vm,
          `callback for immediate watcher "${watcher.expression}"`
        );
      }
    }
    // 返回一个 unwatch 函数，用于解除监听
    return function unwatchFn() {
      watcher.teardown();
    };
  };
}
