/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'
// 通过createCompiler返回一共函数，接收一个配置
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
