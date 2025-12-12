/**
 * stringUtils 单元测试
 * 测试字符串工具函数
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toHalfWidth, trimString, isEmpty, escapeHtml } from '../src/utils/stringUtils.js';

describe('stringUtils', () => {
  describe('toHalfWidth', () => {
    it('应该将全角数字转换为半角数字', () => {
      assert.strictEqual(toHalfWidth('１２３４５'), '12345');
      assert.strictEqual(toHalfWidth('０９８７６'), '09876');
    });

    it('应该处理混合全角和半角数字', () => {
      assert.strictEqual(toHalfWidth('１2３4５'), '12345');
      assert.strictEqual(toHalfWidth('UID：６１４５００'), 'UID：614500');
    });

    it('应该保留非数字字符不变', () => {
      assert.strictEqual(toHalfWidth('abc１２３'), 'abc123');
      assert.strictEqual(toHalfWidth('测试１２３'), '测试123');
    });

    it('应该处理空字符串', () => {
      assert.strictEqual(toHalfWidth(''), '');
    });

    it('应该处理只包含半角数字的字符串', () => {
      assert.strictEqual(toHalfWidth('12345'), '12345');
    });

    it('应该处理特殊字符', () => {
      assert.strictEqual(toHalfWidth('!@#１２３'), '!@#123');
      assert.strictEqual(toHalfWidth('　１２３'), '　123'); // 全角空格保留
    });
  });

  describe('trimString', () => {
    it('应该去除字符串前后的空格', () => {
      assert.strictEqual(trimString('  hello  '), 'hello');
      assert.strictEqual(trimString('   world   '), 'world');
    });

    it('应该保留字符串中间的空格', () => {
      assert.strictEqual(trimString('  hello world  '), 'hello world');
    });

    it('应该处理只包含空格的字符串', () => {
      assert.strictEqual(trimString('   '), '');
      assert.strictEqual(trimString('     '), '');
    });

    it('应该处理空字符串', () => {
      assert.strictEqual(trimString(''), '');
    });

    it('应该处理 null 和 undefined', () => {
      assert.strictEqual(trimString(null), '');
      assert.strictEqual(trimString(undefined), '');
    });

    it('应该处理无空格的字符串', () => {
      assert.strictEqual(trimString('hello'), 'hello');
    });

    it('应该处理制表符和换行符', () => {
      assert.strictEqual(trimString('\thello\n'), 'hello');
      assert.strictEqual(trimString(' \n hello \t '), 'hello');
    });
  });

  describe('isEmpty', () => {
    it('应该识别空字符串', () => {
      assert.strictEqual(isEmpty(''), true);
    });

    it('应该识别只包含空格的字符串', () => {
      assert.strictEqual(isEmpty('   '), true);
      assert.strictEqual(isEmpty('\t\n'), true);
    });

    it('应该识别 null 和 undefined', () => {
      assert.strictEqual(isEmpty(null), true);
      assert.strictEqual(isEmpty(undefined), true);
    });

    it('应该识别非空字符串', () => {
      assert.strictEqual(isEmpty('hello'), false);
      assert.strictEqual(isEmpty('0'), false);
      assert.strictEqual(isEmpty('false'), false);
    });

    it('应该识别包含空格的非空字符串', () => {
      assert.strictEqual(isEmpty('  hello  '), false);
      assert.strictEqual(isEmpty(' a '), false);
    });

    it('应该处理特殊字符', () => {
      assert.strictEqual(isEmpty('!'), false);
      assert.strictEqual(isEmpty('　'), true); // 全角空格会被 trim() 去除，视为空
      assert.strictEqual(isEmpty('测试'), false); // 中文字符视为非空
    });
  });

  describe('边界条件测试', () => {
    it('toHalfWidth 应该处理极长字符串', () => {
      const longString = '１'.repeat(10000);
      const result = toHalfWidth(longString);
      assert.strictEqual(result, '1'.repeat(10000));
      assert.strictEqual(result.length, 10000);
    });

    it('trimString 应该处理极长空格', () => {
      const longSpaces = ' '.repeat(1000) + 'hello' + ' '.repeat(1000);
      assert.strictEqual(trimString(longSpaces), 'hello');
    });

    it('isEmpty 应该快速处理极长空字符串', () => {
      const longSpaces = ' '.repeat(10000);
      assert.strictEqual(isEmpty(longSpaces), true);
    });
  });

  describe('escapeHtml', () => {
    it('应该转义基本的HTML特殊字符', () => {
      assert.strictEqual(escapeHtml('<div>'), '&lt;div&gt;');
      assert.strictEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
      assert.strictEqual(escapeHtml("'world'"), '&#x27;world&#x27;');
      assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
      assert.strictEqual(escapeHtml('a/b'), 'a&#x2F;b');
    });

    it('应该防止XSS脚本注入', () => {
      assert.strictEqual(
        escapeHtml('<script>alert("XSS")</script>'),
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;'
      );
      assert.strictEqual(
        escapeHtml('<img src=x onerror="alert(1)">'),
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
      );
    });

    it('应该转义HTML事件处理器', () => {
      assert.strictEqual(
        escapeHtml('<div onclick="malicious()">'),
        '&lt;div onclick=&quot;malicious()&quot;&gt;'
      );
      assert.strictEqual(
        escapeHtml("<a href='javascript:alert(1)'>"),
        '&lt;a href=&#x27;javascript:alert(1)&#x27;&gt;'
      );
    });

    it('应该转义所有特殊字符的组合', () => {
      assert.strictEqual(
        escapeHtml('<a href="/path?a=1&b=2">Link\'s "text"</a>'),
        '&lt;a href=&quot;&#x2F;path?a=1&amp;b=2&quot;&gt;Link&#x27;s &quot;text&quot;&lt;&#x2F;a&gt;'
      );
    });

    it('应该保留普通文本不变', () => {
      assert.strictEqual(escapeHtml('Hello World'), 'Hello World');
      assert.strictEqual(escapeHtml('测试文本'), '测试文本');
      assert.strictEqual(escapeHtml('12345'), '12345');
    });

    it('应该处理空值', () => {
      assert.strictEqual(escapeHtml(''), '');
      assert.strictEqual(escapeHtml(null), '');
      assert.strictEqual(escapeHtml(undefined), '');
    });

    it('应该处理只包含特殊字符的字符串', () => {
      assert.strictEqual(escapeHtml('&&&'), '&amp;&amp;&amp;');
      assert.strictEqual(escapeHtml('<<<'), '&lt;&lt;&lt;');
      assert.strictEqual(escapeHtml('>>>'), '&gt;&gt;&gt;');
    });

    it('应该处理混合内容', () => {
      assert.strictEqual(
        escapeHtml('用户名: <admin> & 密码: "secret"'),
        '用户名: &lt;admin&gt; &amp; 密码: &quot;secret&quot;'
      );
    });

    it('应该处理极长字符串', () => {
      const longString = '<script>alert("XSS")</script>'.repeat(1000);
      const escaped = escapeHtml(longString);
      assert.ok(!escaped.includes('<script>'));
      assert.ok(!escaped.includes('</script>'));
      assert.ok(escaped.includes('&lt;script&gt;'));
    });

    it('应该防止用户名中的XSS攻击（实际场景）', () => {
      const maliciousUsername = '<img src=x onerror=alert(document.cookie)>';
      const safe = escapeHtml(maliciousUsername);
      assert.strictEqual(
        safe,
        '&lt;img src=x onerror=alert(document.cookie)&gt;'
      );
      // 确保转义后的字符串不包含未转义的HTML标签
      assert.ok(!safe.includes('<img'));
      assert.ok(!safe.includes('<'));
      assert.ok(!safe.includes('>'));
      // 转义后会显示为纯文本，不会被浏览器执行
      assert.ok(safe.includes('&lt;'));
      assert.ok(safe.includes('&gt;'));
    });
  });
});
