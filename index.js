const sh = require('shelljs')
const { Octokit } = require('@octokit/rest')
var gh = new Octokit({
    auth: process.env["TYPES_PUBLISHER_WATCHDOG_TOKEN"]
})

async function main() {
    const prs = await recentPrs()
    const longestLatency = recentPackages(prs)
    if (longestLatency > 5400) {
        console.log("types-publisher's longest unpublished latency was over 1.5 hour.");
        throw new Error();
    }
}

/**
 * 1. Only match paths that begin with types/
 * 2. Only match paths that end with index.d.ts; test changes don't cause a republish
 * 3. Capture the package name
 */
const THIS_IS_FINE = /^types\/([^\/]+?)\/index.d.ts$/

/** @returns {Promise<Map<string, { mergeDate: Date, pr: number, deleted: boolean }>>} */
async function recentPrs() {
    console.log('search for 5 most recently created PRs')
    const searchByCreatedDate = await gh.search.issuesAndPullRequests({
        q: "is:pr is:merged repo:DefinitelyTyped/DefinitelyTyped",
        order: "desc",
        per_page: 5,
        page: 1
    })
    console.log('search for 5 most recently updated PRs')
    const searchByUpdateDate = await gh.search.issuesAndPullRequests({
        q: "is:pr is:merged repo:DefinitelyTyped/DefinitelyTyped",
        sort: "updated",
        order: "desc",
        per_page: 5,
        page: 1
    })
    /** @type {Map<string, { mergeDate: Date, pr: number, deleted: boolean }>} */
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
 * @param {Map<string, { mergeDate: Date, pr: number, deleted: boolean }>} prs
 */
async function addPr(item, prs) {
    console.log('get merge_at date for PR', item.number)
    const mergedAt = (await gh.pulls.get({
        owner: "DefinitelyTyped",
        repo: "DefinitelyTyped",
        pull_number: item.number
    })).data.merged_at
    if (mergedAt == null)
        return
    const mergeDate = new Date(mergedAt)
    console.log('list first 100 files for PR', item.number)
    const fileEntries = (await gh.pulls.listFiles({
        owner: "DefinitelyTyped",
        repo: "DefinitelyTyped",
        pull_number: item.number,
        per_page: 100,
    })).data
    /** @type {Set<string>} */
    const packages = new Set()
    /** @type {Set<string>} */
    const deleteds = new Set()
    for (const fileChange of fileEntries) {
        const m = fileChange.filename.match(THIS_IS_FINE)
        if (m == null)
            continue
        packages.add(m[1])
        if (fileChange.status === "D" || fileChange.status === "removed")
            deleteds.add(m[1])
    }
    for (const name of packages) {
        const prev = prs.get(name)
        if (!prev || mergeDate > prev.mergeDate) {
            prs.set(name, { mergeDate, pr: item.number, deleted: deleteds.has(name) })
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
/** @param {Map<string, { mergeDate: Date, pr: number, deleted: boolean }>} prs */
function recentPackages(prs) {
    console.log()
    console.log()
    console.log("## Interesting PRs ##")
    let longest = 0
    let longestName = 'No unpublished PRs found'
    for (const [name, { mergeDate, pr, deleted }] of prs) {
        const { deprecated, publishDate } = parseNpmInfo(sh.exec(`npm info @types/${name} time.modified deprecated`, { silent : true }).stdout.toString())
        if (mergeDate > publishDate || isNaN(publishDate.getTime()) || deprecated !== deleted) {
            console.log(`${name}: #${pr} not published yet; latency so far: ${(Date.now() - mergeDate.valueOf()) / 1000}`)
            console.log('       merged:' + mergeDate)
            console.log('    published:' + publishDate)
            const latency = Date.now() - mergeDate.valueOf();
            if (latency > longest) {
                longest = latency
                longestName = name
            }
        }
        else if (monthSpan(publishDate, mergeDate) > 1) {
            console.log(`${name}: published long before merge; probably a rogue edit to #${pr}`)
            console.log('       merged:' + mergeDate)
            console.log('    published:' + publishDate)
        }
        else if (publishDate.valueOf() - mergeDate.valueOf() > 100000000) {
            console.log(`${name}: #${pr} very long latency: ${(publishDate.valueOf() - mergeDate.valueOf()) / 1000}`)
            console.log('       merged:' + mergeDate)
            console.log('    published:' + publishDate)
        }
    }
    console.log()
    console.log()
    console.log("## Longest publish latency ##")
    console.log(longestName + ': ' + (longest / 1000))
    return longest / 1000
}
/** @param {string} info */
function parseNpmInfo(info) {
    if (info.includes("deprecated")) {
        const firstLine = info.split('\n')[0]
        return { publishDate: new Date(firstLine.slice(firstLine.indexOf("'") + 1, firstLine.length - 1)), deprecated: true }
    }
    else {
        return { publishDate: new Date(info.trim()), deprecated: false }
    }
}
main().catch(error => {
    console.error(error && (error.stack || error.message || error))
    process.exit(1)
})
