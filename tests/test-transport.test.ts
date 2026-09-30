import './setup.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
test('test transport refuses external URLs and automatic redirects from local fixtures', async () => {
  assert.throws(() => fetch('https://example.invalid'), /External test fetch refused/);
  const server = createServer((_req,res) => {res.writeHead(302,{location:'https://example.invalid'});res.end();});
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address() as {port:number};
    await assert.rejects(fetch(`http://127.0.0.1:${address.port}`,{redirect:'follow'}), error => String((error as Error & {cause?:Error}).cause).includes('unexpected redirect'));
  } finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
});

test('Undici refuses external destinations with default or explicit agents and guarded redirects', async () => {
  const { Agent, fetch: undiciFetch } = await import('undici');
  const { config } = await import('@aihot/backend/config');
  const { guardedFetch } = await import('../packages/backend/src/lib/http-fetch.ts');
  const refused = (error: unknown) => String((error as Error & {cause?:Error}).cause).includes('External test fetch refused');
  const agent = new Agent();
  const before = config.allowPrivateNetworkFetch;
  config.allowPrivateNetworkFetch = true;
  const server = createServer((_req,res) => {res.writeHead(302,{location:'http://93.184.216.34/'});res.end();});
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    await assert.rejects(undiciFetch('http://93.184.216.34/'), refused);
    await assert.rejects(undiciFetch('http://93.184.216.34/', {dispatcher:agent}), refused);
    await assert.rejects(guardedFetch('http://93.184.216.34/'), refused);
    const address=server.address() as {port:number};
    await assert.rejects(guardedFetch(`http://127.0.0.1:${address.port}`), refused);
  } finally {
    config.allowPrivateNetworkFetch = before;
    await agent.close();
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
