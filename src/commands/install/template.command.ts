import { TemplateSource } from '../../classes/TemplateSource.class.ts'
import { TemplateRegistry } from '../../classes/TemplateRegistry.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio install template <git-url> [--as <alias>] [--ref <ref>] [--refresh]')

    const registry = await TemplateRegistry.load()
    const installed = await registry.install(args[0], {
        as: typeof context.flags.as === 'string' ? context.flags.as : null,
        ref: typeof context.flags.ref === 'string' ? context.flags.ref : null,
        refresh: context.flags.refresh === true,
    })

    console.log(`Installed ${installed.alias} from ${TemplateSource.origin(installed.source.url, installed.source.sha)}`)
    console.log(`Templates: ${installed.templates.join(', ') || 'none'}`)
    console.log(`Features: ${installed.features.join(', ') || 'none'}`)

    for (const kind of TemplateRegistry.KINDS)
        for (const name of installed.conflicts[kind])
            console.log(`\nThe ${kind} ${name} is provided by ${registry.providers(kind, name).map((alias) => `${alias}/${name}`).join(' and ')}.\nUse a full name, or choose which one ${name} means: gstudio use ${kind} ${name} ${installed.alias}/${name}`)
}
