import yargs, { Arguments } from "yargs";
import { existsSync } from "fs";
import { KafkaService, KafkaSettings } from "./services/kafka.service";
import { hideBin } from "yargs/helpers";
import { join, resolve } from 'path';
import { Factory } from './services/factory';

const CHUNK_SIZE = 4000

const exitApp = (message: string) => {
  console.log(message)
  console.log('Exit app')
  process.exit()
}

async function start() {
  console.log('3.0.0 App started')
  const argv = yargs(hideBin(process.argv)).argv as Arguments<{ path?: string, settings?: string }>
  let path: string | undefined
  let settings: string | undefined
  if (process.platform === 'linux') {
    const [pathArg, settingsArg] = argv._ as string[]
    path = pathArg?.split('=')?.[1]
    settings = settingsArg?.split('=')?.[1]
  } else {
    path = argv.path
    settings = argv.settings
  }
  let kafkaSettings: KafkaSettings
  if (settings && ['test', 'ppak'].includes(settings.toLowerCase())) {
    console.log(`Creating ${settings} settings`)
    kafkaSettings = settings.toLowerCase() === 'test' ? KafkaSettings.createTestSettings() : KafkaSettings.createPPAKSettings()
  } else {
    console.log(`Creating PPAK settings`)
    kafkaSettings = KafkaSettings.createPPAKSettings()
  }

  try {
    if (path) {
      if (!existsSync(path)) {
        exitApp('File not found')
      } else {
        const factory = new Factory(path)
        const { converter, topic, validator } = await factory.getInstances(exitApp)

        const messagesArr = converter.convertToJSON()
        const validatedRows = messagesArr.map(m => validator.validateRow(m))
        const rowsForSending = validator.prepareForSending(validatedRows)

        const kafka = KafkaService.getInstance(
          kafkaSettings
        )

        for (let i = 0; i < rowsForSending.length; i += CHUNK_SIZE) {
          const chunk = rowsForSending.slice(i, i + CHUNK_SIZE)
          await kafka.sendMessage(topic, chunk)
        }

        console.log(`${rowsForSending.length} messages sent`)
        console.log('Logs available at')
        console.log(join(resolve('./'), 'logs.csv'))
        console.log('Exit app')
        process.exit()
      }
    } else {
      exitApp('Path not specified')
    }
  } catch (e) {
    console.log(e)
    exitApp('App crash')
  }
}

start()
