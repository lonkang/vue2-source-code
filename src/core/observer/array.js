/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */
/**
 * 定义 arrayMethods 对象，用于增强 Array.prototype
 * 当访问 arrayMethods 对象上的那七个方法时会被拦截，以实现数组响应式
 */
import { def } from "../util/index";

// 备份 数组 原型对象
const arrayProto = Array.prototype;
// 通过继承的方式创建新的 arrayMethods
export const arrayMethods = Object.create(arrayProto);

// 操作数组的七个方法，这七个方法可以改变数组自身
const methodsToPatch = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
];
/*
  vue在数据初始化时调用initData方法，然后通过new Observer对数据进行监测，然后对数据进行判断，如果是数组并且支持原型链就会执行protoAugment让目标原型链指向arrayMethods，arrayMethods用来改写数组的原型方法。内部会采用函数劫持的方式，当用户调用这些方法（push，pop，shift，unshift，sort，splice，reverse）之后，还会调用原数组的方法进行更新数组。拿到原数组的方法，然后重新定义这些方法。
  用户调方法时走的就是这个重写的mutator函数，这个函数还是会调用数组原有的方法，重写的mutator函数中会调用原生的方法，对新增数组的方法push，unshift，splice可以帮我们更新数组中的新增一项，对插入的数据使用observeArray再次进行监测，最后通过dep.notify通知视图更新。
*/

/**
 * 可以看到，arrayMethods 首先继承了 Array，
 * 然后对数组中所有能改变数组自身的方法，如 push、pop 等这些方法进行重写。
 * 重写后的方法会先执行它们本身原有的逻辑，
 * 并对能增加数组长度的 3 个方法 push、unshift、splice 方法做了判断，
 * 获取到插入的值，然后把新添加的值变成一个响应式对象，
 * 并且再调用 ob.dep.notify() 手动触发依赖通知，
 * 这就很好地解释了之前的示例中调用 vm.items.splice(newLength) 方法可以检测到变化
 */
/**
 * 拦截变异方法并触发事件
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓存原生方法，比如 push
  const original = arrayProto[method];
  // def 就是 Object.defineProperty，拦截 arrayMethods.method 的访问
  def(arrayMethods, method, function mutator(...args) {
    // 先执行原生方法，比如 push.apply(this, args)
    const result = original.apply(this, args);
    const ob = this.__ob__;
    let inserted;
    // 如果 method 是以下三个之一，说明是新插入了元素
    switch (method) {
      case "push":
      case "unshift":
        inserted = args;
        break;
      case "splice":
        inserted = args.slice(2);
        break;
    }
    // 对新插入的元素做响应式处理
    if (inserted) ob.observeArray(inserted);
    // notify change
    // 手动触发依赖更新
    ob.dep.notify();
    return result;
  });
});
