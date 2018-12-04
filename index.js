const sh = require('shelljs')
const fs = require('fs')
const Gh = require('@octokit/rest')
var gh = new Gh()

async function main() {
    gh.authenticate({
        type: "token",
        token: process.env["TYPES_PUBLISHER_WATCHDOG_TOKEN"] || ""
    })
    const prs = await recentPrs()
    const averageLatency = recentPackages(prs)
    if (averageLatency > 10000) {
        console.log("average types-publisher latency was over 10,000 seconds");
        throw new Error();
    }
}

/**
 * 1. Only match paths that begin with types/
 * 2. Only match paths that end with index.d.ts; test changes don't cause a republish
 * 3. Capture the package name
 */
const THIS_IS_FINE = /^types\/([^\/]+?)\/index.d.ts$/

/** @returns {Promise<Map<string, { mergeDate: Date, pr: number }>>} */
async function recentPrs() {
    const searchByCreatedDate = await gh.search.issues({
        q: "is:pr is:merged repo:DefinitelyTyped/DefinitelyTyped",
        order: "desc",
        per_page: 5,
        page: 1
    })
    const searchByUpdateDate = await gh.search.issues({
        q: "is:pr is:merged repo:DefinitelyTyped/DefinitelyTyped",
        sort: "updated",
        order: "desc",
        per_page: 5,
        page: 1
    })
    /** @type {Map<string, { mergeDate: Date, pr: number }>} */
    const prs = new Map()
    for (const it of searchByCreatedDate.data.items) {
        await addPr(it, prs)
    }
    for (const it of searchByUpdateDate.data.items) {
        await addPr(it, prs)
    }
    return prs
}
/**
 * @param {{ number: number }} item
 * @param {Map<string, { mergeDate: Date, pr: number }>} prs
 */
async function addPr(item, prs) {
    const mergedAt = (await gh.pulls.get({
        owner: "DefinitelyTyped",
        repo: "DefinitelyTyped",
        number: item.number
    })).data.merged_at
    if (mergedAt == null)
        return
    const mergeDate = new Date(mergedAt)
    const fileEntries = (await gh.pulls.listFiles({
        owner: "DefinitelyTyped",
        repo: "DefinitelyTyped",
        number: item.number,
        per_page: 100,
    })).data
    /** @type {Set<string>} */
    const indices = new Set()
    for (const fileChange of fileEntries) {
        const m = fileChange.filename.match(THIS_IS_FINE)
        if (m == null)
            continue
        const oops = (await gh.repos.listCommits({
            owner: "DefinitelyTyped",
            repo: "DefinitelyTyped",
            path: `types/${m[1]}`
        }))
        const commitAuthorDate = new Date(oops.data[0].commit.author.date)
        if (commitAuthorDate > mergeDate) {
            console.log(`${m[1]} was updated on ${commitAuthorDate}, after PR ${item.number} was merged on ${mergeDate}. Skipping.`)
            continue
        }
        indices.add(m[1])
    }
    for (const name of indices) {
        const prev = prs.get(name)
        if (!prev || mergeDate > prev.mergeDate) {
            prs.set(name, { mergeDate, pr: item.number })
        }
    }
}
/**
 * @param {Date} m1
 * @param {Date} m2
 */
function monthSpan(m1, m2) {
    var diff = m1.getMonth() - m2.getMonth()
    return diff < 0 ? diff + 12 : diff
}
/** @param {Map<string, { mergeDate: Date, pr: number }>} prs */
function recentPackages(prs) {
    /** @type {Array<[string, number]>} */
    let latencies = []
    console.log()
    console.log()
    console.log("## Interesting PRs ##")
    for (const [name, { mergeDate, pr }] of prs) {
        const publishDate = new Date(sh.exec(`npm info @types/${name} time.modified`, { silent : true }).stdout.trim())
        if (mergeDate > publishDate || isNaN(publishDate.getTime())) {
            console.log(`${name}: #${pr} not published yet; latency so far: ${(Date.now() - mergeDate.valueOf()) / 1000}`)
            console.log('       merged:' + mergeDate)
            console.log('    published:' + publishDate)
            latencies.push([name, Date.now() - mergeDate.valueOf()])
        }
        else if (monthSpan(publishDate, mergeDate) > 1) {
            console.log(`${name}: published long before merge; probably a rogue edit to #${pr}`)
            console.log('       merged:' + mergeDate)
            console.log('    published:' + publishDate)
        }
        else {
            latencies.push([name, publishDate.valueOf() - mergeDate.valueOf()])
            if (publishDate.valueOf() - mergeDate.valueOf() > 100000000) {
                console.log(`${name}: #${pr} very long latency: ${(publishDate.valueOf() - mergeDate.valueOf()) / 1000}`)
                console.log('       merged:' + mergeDate)
                console.log('    published:' + publishDate)
            }
        }
    }
    latencies.sort(([_n1, l1], [_n2, l2]) => l1 === l2 ? 0 : l1 < l2 ? -1 : 1)
    let sum = 0
    console.log()
    console.log()
    console.log("## Publish latency ##")
    for (const [name, latency] of latencies) {
        sum += latency
        console.log(name + ': ' + (latency / 1000))
    }
    console.log()
    console.log('Average: ' + (sum / latencies.length / 1000))
    return sum / latencies.length / 1000
}
main().catch(_ => process.exit(1))
