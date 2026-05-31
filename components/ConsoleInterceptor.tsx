'use client';

import { useEffect } from 'react';

export default function ConsoleInterceptor() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const safeStringify = (val: any, seen = new WeakSet()): any => {
      if (val === null || val === undefined) return val;

      if (typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular Reference]';
        }
        seen.add(val);

        // Handle DOM node rendering safely details
        if (val instanceof HTMLElement) {
          return `[HTMLElement: ${val.tagName.toLowerCase()}${val.id ? '#' + val.id : ''}${val.className ? '.' + val.className.split(' ').join('.') : ''}]`;
        }

        // Handle Event objects
        if (val instanceof Event) {
          return `[Event: ${val.type} (target: ${val.target instanceof HTMLElement ? val.target.tagName : 'non-HTML'})]`;
        }

        // Handle error objects explicitly to dump name + message + stack safely
        if (val instanceof Error) {
          return {
            name: val.name,
            message: val.message,
            stack: val.stack
          };
        }

        // Handle Array serialization
        if (Array.isArray(val)) {
          return val.map(item => {
            try {
              return safeStringify(item, seen);
            } catch {
              return '[Unserializable Item]';
            }
          });
        }

        // Handle plain/custom objects
        const res: Record<string, any> = {};
        // Safely extract property names (avoiding infinite loops on custom getters)
        const keys = Object.getOwnPropertyNames(val);
        for (const k of keys) {
          try {
            res[k] = safeStringify((val as any)[k], seen);
          } catch {
            res[k] = '[Unserializable Value]';
          }
        }
        return res;
      }

      // Symbol and BigInt conversion
      if (typeof val === 'symbol') return val.toString();
      if (typeof val === 'bigint') return val.toString();

      return val;
    };

    const methods: Array<'log' | 'error' | 'warn' | 'info'> = ['log', 'error', 'warn', 'info'];
    methods.forEach(method => {
      const original = console[method];
      if (typeof original === 'function') {
        console[method] = Object.assign(function (...args: any[]) {
          const safeArgs = args.map(arg => {
            try {
              if (arg !== null && typeof arg === 'object') {
                return safeStringify(arg);
              }
            } catch {
              return '[SafeStringify Failed]';
            }
            return arg;
          });
          original.apply(console, safeArgs);
        }, original);
      }
    });
  }, []);

  return null;
}
