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
    // fs.writeFileSync('/home/nathansa/types-publisher-watchdog/latency.json', JSON.stringify(rows))
}

/**
 * 1. Only match paths that begin with types/
 * 2. Only match paths that end with index.d.ts; test changes don't cause a republish
 * 3. Capture the package name
 */
const THIS_IS_FINE = /^types\/([^\/]+?)\/index.d.ts$/

/** returns {Promise<Map<string, Date>>} */
async function recentPrs() {
    const search = await gh.search.issues({
        q: "is:pr is:merged repo:DefinitelyTyped/DefinitelyTyped",
        order: "desc",
        per_page: 30,
        page: 1
    })
    /** @type {Map<string, { mergeDate: Date, pr: number }>} */
    const prs = new Map()
    for (const it of search.data.items) {
        const mergeDate = (await gh.pulls.get({
            owner: "DefinitelyTyped",
            repo: "DefinitelyTyped",
            number: it.number
        })).data.merged_at
        if (mergeDate == null)
            continue
        const fileEntries = (await gh.pulls.listFiles({
            owner: "DefinitelyTyped",
            repo: "DefinitelyTyped",
            number: it.number,
            per_page: 100,
        })).data
        /** @type {Set<string>} */
        const mini = new Set()
        for (const fileChange of fileEntries) {
            const m = fileChange.filename.match(THIS_IS_FINE)
            if (m == null)
                continue
            mini.add(m[1])
        }
        for (const name of mini) {
            const date = new Date(mergeDate)
            const prev = prs.get(name)
            if (!prev || date > prev.mergeDate) {
                prs.set(name, { mergeDate: date, pr: it.number })
            }
        }
    }
    return prs
}
/** @param {Map<string, { mergeDate: Date, pr: number }>} prs */
function recentPackages(prs) {
    /** @type {Array<[string, number]>} */
    let latencies = []
    console.log()
    console.log()
    console.log("## Unpublished PRs ##")
    for (const [name, { mergeDate, pr }] of prs) {
        const publishDate = new Date(sh.exec(`npm info @types/${name} time.modified`, { silent : true }).stdout.trim())
        if (mergeDate > publishDate) {
            console.log(`${name}: #${pr} not published yet; latency so far: ${(Date.now() - mergeDate.valueOf()) / 1000}`)
            console.log('       merged:' + mergeDate)
            console.log('    published:' + publishDate)
            latencies.push([name, Date.now() - mergeDate.valueOf()])
        }
        else {
            latencies.push([name, publishDate.valueOf() - mergeDate.valueOf()])
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
