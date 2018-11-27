const sh = require('shelljs')
const fs = require('fs')
const Gh = require('@octokit/rest')
var gh = new Gh()

async function main() {
    gh.authenticate({
        type: "token",
        token: fs.readFileSync('/home/nathansa/api.token', { encoding: 'utf-8' })
    })
    const prs = await recentPrs()
    recentPackages(prs)
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
    /** @type {Map<string, Date>} */
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
            const prevDate = prs.get(name)
            if (!prevDate || date > prevDate) {
                prs.set(name, date)
            }
        }
    }
    return prs
}
/** @param {Map<string, Date>} prs */
function recentPackages(prs) {
    let sum = 0
    let count = 0
    for (const [name, mergeDate] of prs) {
        const publishDate = new Date(sh.exec(`npm info @types/${name} time.modified`, { silent : true }).stdout.trim())
        if (mergeDate > publishDate) {
            console.log(name + ': not published yet; latency so far: ' + (Date.now() - mergeDate.valueOf()) / 1000)
            console.log('    merged:' + mergeDate)
            console.log('    published:' + publishDate)
            sum += Date.now() - mergeDate.valueOf()
        }
        else {
            console.log(name + ': ' + ((publishDate.valueOf() - mergeDate.valueOf()) / 1000))
            sum += publishDate.valueOf() - mergeDate.valueOf()
        }
        count++
    }
    console.log('Average: ' + (sum / count / 1000))
}
main()
