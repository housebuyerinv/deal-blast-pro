const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')
const assert = require('assert')

const parserPath = path.join(__dirname, '..', 'src', 'lib', 'creativeFinanceParser.ts')
const source = fs.readFileSync(parserPath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
})

const sandbox = {
  exports: {},
  module: { exports: {} },
  require,
  console,
}
sandbox.exports = sandbox.module.exports
vm.runInNewContext(compiled.outputText, sandbox, { filename: parserPath })

const {
  parseCreativeFinanceDetails,
  cloneCreativeFinanceDetails,
  hasCreativeFinanceDetails,
} = sandbox.module.exports

const cases = [
  {
    name: 'seller finance preferred',
    text: 'Seller financing preferred, ideally less than 20% down',
    expect: details => {
      assert.strictEqual(details.sellerFinanceAccepted, true)
      assert.strictEqual(details.creativeFinanceAccepted, true)
      assert.strictEqual(details.maximumDownPaymentPercent, 20)
      assert.match(details.creativeFinanceNotes, /less than 20% down/i)
    },
  },
  {
    name: 'owner financing cash accepted',
    text: 'Prefers owner financing but will buy all cash',
    expect: details => {
      assert.strictEqual(details.sellerFinanceAccepted, true)
      assert.match(details.creativeStructure, /Owner Financing/i)
      assert.match(details.creativeStructure, /Cash Accepted/i)
    },
  },
  {
    name: '$10K down and monthly payments',
    text: 'Owner financing, approximately $10K down, remaining balance paid monthly',
    expect: details => {
      assert.strictEqual(details.maximumDownPayment, 10000)
      assert.match(details.creativeFinanceNotes, /remaining balance paid monthly/i)
    },
  },
  {
    name: 'subject-to hybrid',
    text: 'Creative finance preferred including seller finance, subject-to, and hybrid structures',
    expect: details => {
      assert.strictEqual(details.creativeFinanceAccepted, true)
      assert.strictEqual(details.sellerFinanceAccepted, true)
      assert.strictEqual(details.subjectToAccepted, true)
      assert.match(details.creativeStructure, /Seller Finance/)
      assert.match(details.creativeStructure, /Subject To/)
      assert.match(details.creativeStructure, /Hybrid/)
    },
  },
  {
    name: 'assumable mortgage',
    text: 'Assumable notes up to $10M',
    expect: details => {
      assert.strictEqual(details.assumableAccepted, true)
      assert.strictEqual(details.existingMortgageAccepted, true)
      assert.strictEqual(details.creativePurchaseMaximum, 10000000)
    },
  },
  {
    name: 'wrap lease option dscr',
    text: 'Wraparound mortgage, lease option, and DSCR deals considered',
    expect: details => {
      assert.strictEqual(details.wrapAccepted, true)
      assert.strictEqual(details.leaseOptionAccepted, true)
      assert.strictEqual(details.dscrAccepted, true)
    },
  },
  {
    name: 'down payment range',
    text: 'Seller finance preferred with 50%-60% down',
    expect: details => {
      assert.strictEqual(details.minimumDownPaymentPercent, 50)
      assert.strictEqual(details.maximumDownPaymentPercent, 60)
    },
  },
  {
    name: 'interest balloon amortization piti',
    text: 'Interest under 5%, balloon in 5 years, 30-year amortization, PITI included',
    expect: details => {
      assert.strictEqual(details.maximumInterestRate, 5)
      assert.strictEqual(details.balloonTermYears, 5)
      assert.strictEqual(details.balloonTermMonths, 60)
      assert.strictEqual(details.amortizationYears, 30)
      assert.strictEqual(details.amortizationMonths, 360)
      assert.strictEqual(details.pitiIncluded, true)
    },
  },
  {
    name: 'existing mortgage rate',
    text: 'Subject to existing mortgage with existing mortgage rate under 4%',
    expect: details => {
      assert.strictEqual(details.subjectToAccepted, true)
      assert.strictEqual(details.existingMortgageAccepted, true)
      assert.strictEqual(details.mortgageRateMaximum, 4)
    },
  },
  {
    name: 'blank details remain blank',
    text: 'Cash buyer for small multifamily in PA',
    expect: details => {
      assert.strictEqual(hasCreativeFinanceDetails(details), false)
    },
  },
]

for (const testCase of cases) {
  const details = parseCreativeFinanceDetails(testCase.text)
  testCase.expect(details)
}

const first = parseCreativeFinanceDetails('Seller finance preferred with 50%-60% down')
const second = parseCreativeFinanceDetails('Owner financing with approximately $10K down')
const clonedFirst = cloneCreativeFinanceDetails(first)
clonedFirst.maximumDownPaymentPercent = 90
assert.strictEqual(first.maximumDownPaymentPercent, 60)
assert.strictEqual(second.maximumDownPayment, 10000)
assert.notStrictEqual(first, second)

const payload = {
  creativeFinanceDetails: parseCreativeFinanceDetails('Seller finance preferred, ideally less than 20% down'),
  notes: 'Original criteria preserved',
}
assert.strictEqual(payload.creativeFinanceDetails.maximumDownPaymentPercent, 20)
assert.match(payload.notes, /Original criteria preserved/)

console.log(`Creative finance parser smoke tests passed (${cases.length} phrase cases plus independence and payload checks).`)
