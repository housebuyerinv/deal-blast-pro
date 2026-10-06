import test from 'node:test';
import assert from 'node:assert/strict';
import {simulatePlans} from '../../server/buyermatch/usage.js';
test('candidate allowance simulations are independent, clamped, and never mutate real entitlement',()=>{
 const usage={analysis:{allowance:0,used:23},softwareDistribution:{allowance:0,used:4},managedDispo:{used:70}};
 const before=JSON.stringify(usage), result=simulatePlans(usage);
 assert.equal(result.starter.analysis.remaining,0);
 assert.equal(result.starter.softwareDistribution.remaining,16);
 assert.equal(result.pro.analysis.remaining,27);
 assert.equal(result.pro.softwareDistribution.remaining,46);
 assert.equal(result.starter.hypothetical,true);
 assert.equal(JSON.stringify(usage),before);
});
