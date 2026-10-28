import test from 'node:test'
import assert from 'node:assert/strict'
import { pdfOutlineDestination } from '../public/vendor/foliate-js/pdf-destination.mjs'

test('PDF outline handles missing, broken, and valid destinations', async () => {
    const pdf = {
        numPages: 4,
        getDestination: async name => name === 'valid' ? [{ num: 2 }] : null,
        getPageIndex: async ref => { if (ref.num === 99) throw new Error('invalid reference'); return ref.num - 1 },
    }
    assert.equal(await pdfOutlineDestination(pdf, 'null'), null)
    assert.equal(await pdfOutlineDestination(pdf, JSON.stringify('missing')), null)
    assert.equal(await pdfOutlineDestination(pdf, JSON.stringify([{ num: 99 }])), null)
    assert.equal(await pdfOutlineDestination(pdf, 'not-json'), null)
    assert.deepEqual(await pdfOutlineDestination(pdf, JSON.stringify('valid')), [1, null])
})
