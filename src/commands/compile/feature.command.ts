import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Agent } from '../../classes/Agent.class.ts'
import { Feature } from '../../classes/Feature.class.ts'
import { TemplateSource } from '../../classes/TemplateSource.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio compile feature <name | directory> [--model <model>] [--effort <effort>]')

    const feature = (await stat(resolve(args[0])).then((entry) => entry.isDirectory()).catch(() => false))
        ? await Feature.at(resolve(args[0]))
        : await Feature.read(await TemplateSource.fetch('.'), args[0])
    const compiled = await feature.compile(new Agent(typeof context.flags.model === 'string' ? context.flags.model : undefined, typeof context.flags.effort === 'string' ? context.flags.effort : undefined))

    console.log(feature.name)

    if (compiled.steps === null) console.log('  no steps to compile')

    for (const path of compiled.steps?.built ?? []) console.log(`  built    ${path}`)
    for (const path of compiled.steps?.reused ?? []) console.log(`  reused   ${path}`)
    for (const path of compiled.steps?.removed ?? []) console.log(`  removed  ${path}`)

    for (const artifact of compiled.artifacts) {
        console.log(`artifact ${artifact.name}`)

        for (const path of artifact.built) console.log(`  built    ${path}`)
        for (const path of artifact.reused) console.log(`  reused   ${path}`)
        for (const path of artifact.removed) console.log(`  removed  ${path}`)
    }
}
