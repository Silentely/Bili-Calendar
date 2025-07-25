// netlify-functions.js
// 这个文件帮助Netlify处理ES模块格式的函数

const { build } = require('@netlify/functions');

// 为函数构建配置特殊处理
module.exports = {
  async onPreBuild({ utils }) {
    // 在构建前运行
    console.log('准备构建Netlify函数...');
  },
  async onBuild({ utils }) {
    // 在构建过程中运行
    console.log('正在构建Netlify函数...');
    
    // 可以在这里执行任何需要的转换操作
  },
  async onPostBuild({ utils }) {
    // 构建后运行
    console.log('Netlify函数构建完成！');
  }
}; 