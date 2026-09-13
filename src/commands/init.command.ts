import { mkdir } from 'node:fs/promises'
import { Artifact } from '../classes/Artifact.class.ts'
import { Template } from '../classes/Template.class.ts'
import { TemplateRef } from '../classes/TemplateRef.class.ts'
import { TemplateRegistry } from '../classes/TemplateRegistry.class.ts'
import { TemplateSource } from '../classes/TemplateSource.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) {
        await mkdir(`${process.cwd()}/${Artifact.ROOT}`, { recursive: true })

        console.log(`Initialized ${Artifact.ROOT} at ${process.cwd()}/${Artifact.ROOT}`)
        console.log(`Define an artifact at ${Artifact.ROOT}/<name>/${Artifact.DEFINITION}, then run: gstudio compile artifact <name>`)

        return
    }

    const reference = TemplateRef.parse(args[0])
    const resolved = reference.kind === 'url' ? null : (await TemplateRegistry.load()).resolve(reference)
    const source = await TemplateSource.fetch(resolved?.url ?? reference.url!, reference.ref ?? resolved?.ref ?? null, { refresh: context.flags.refresh === true })
    const template = await Template.read(source, resolved?.name ?? null)
    const initialized = await template.init(process.cwd(), { force: context.flags.force === true, install: context.flags['no-install'] !== true })

    console.log(`Initialized ${template.name}${template.version === null ? '' : ` ${template.version}`} from ${TemplateSource.origin(source.url, source.sha)}`)

    if (initialized.installed) console.log(`Ran ${Template.INSTALL}`)
}
