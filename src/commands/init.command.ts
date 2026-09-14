import { mkdir } from 'node:fs/promises'
import { Artifact } from '../classes/Artifact.class.ts'
import { Template } from '../classes/Template.class.ts'
import { TemplateRef } from '../classes/TemplateRef.class.ts'
import { TemplateRegistry } from '../classes/TemplateRegistry.class.ts'
import { TemplateSource } from '../classes/TemplateSource.class.ts'
import { Progress } from '../classes/Progress.class.ts'

export const help = {
    short: 'Lays a template down here, or scaffolds .gstudio when given no template',
    long: `Usage: gstudio init [<template>] [--force] [--no-install] [--refresh]

With no template, creates .gstudio/artifacts so this project can define its own
artifacts. With one, lays that template down in the current directory.

Arguments:
  <template>   the template, as a bare name, as <alias>/<name>, or as a git url

Flags:
  --force      write over files that already exist
  --no-install do not run the template's install step
  --refresh    re-fetch the source instead of reusing the cached clone`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) {
        await Progress.of(`Creating ${Artifact.ROOT}`).run(() => mkdir(`${process.cwd()}/${Artifact.ROOT}`, { recursive: true }))

        console.log(`Initialized ${Artifact.ROOT} at ${process.cwd()}/${Artifact.ROOT}`)
        console.log(`Define an artifact at ${Artifact.ROOT}/<name>/${Artifact.DEFINITION}, then run: gstudio compile artifact <name>`)

        return
    }

    const reference = TemplateRef.parse(args[0])
    const { source, template, initialized } = await Progress.of(`Resolving the template ${args[0]}`).run(async (progress) => {
        const resolved = reference.kind === 'url' ? null : (await TemplateRegistry.load()).resolve('template', reference)

        progress.say(`Fetching ${resolved?.name ?? args[0]}`)

        const source = await TemplateSource.fetch(resolved?.url ?? reference.url!, reference.ref ?? resolved?.ref ?? null, { refresh: context.flags.refresh === true })
        const template = await Template.read(source, resolved?.name ?? null)

        progress.say(`Laying ${template.name} down here`)

        return { source, template, initialized: await template.init(process.cwd(), { force: context.flags.force === true, install: context.flags['no-install'] !== true }) }
    })

    console.log(`Initialized ${template.name}${template.version === null ? '' : ` ${template.version}`} from ${TemplateSource.origin(source.url, source.sha)}`)

    if (initialized.installed) console.log(`Ran ${Template.INSTALL}`)
}
