/**
Copyright 2021 Forestry.io Holdings, Inc.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { indexDB } from '../build'
import { resolve } from '../resolve'
import fs from 'fs-extra'
import { buildASTSchema, printSchema, print, parse } from 'graphql'
import path from 'path'
import fg from 'fast-glob'

import type { TinaCloudSchema } from '../types'
import { createDatabase } from '../database'
import { Database } from '../database'
import type { Bridge } from '../database/bridge'
import type { Store } from '../database/store'
import { sequential } from '../util'
import { parseFile, stringifyFile } from '../database/util'

export class InMemoryBridge implements Bridge {
  public rootPath: string
  private mockFileSystem: { [filepath: string]: string } | undefined
  constructor(rootPath: string) {
    this.rootPath = rootPath
  }
  public async putConfig(filepath: string, data: string) {
    await this.put(filepath, data)
  }
  public supportsBuilding() {
    return true
  }
  public async glob(pattern: string) {
    const items = await fg(path.join(this.rootPath, pattern, '**/*'), {
      dot: true,
    })
    return items.map((item) => {
      return item.replace(this.rootPath, '')
    })
  }
  public async get(filepath: string) {
    const mockData = await this.getMockData()
    const value = mockData[filepath]
    if (!value) {
      throw new Error(`Unable to find record for ${filepath}`)
    }
    return value
  }
  public async put(filepath: string, data: string) {
    const mockData = await this.getMockData()
    this.mockFileSystem = { ...mockData, [filepath]: data }
  }

  public getMockData = async () => {
    if (!this.mockFileSystem) {
      const files = await this.glob('content')
      const mockFileSystem: { [filename: string]: string } = {}
      await sequential(files, async (file) => {
        const data = await fs
          .readFileSync(path.join(this.rootPath, file))
          .toString()
        mockFileSystem[file] = data
        return true
      })
      this.mockFileSystem = mockFileSystem
    }
    return this.mockFileSystem
  }
}

export class InMemoryStore implements Store {
  rootPath: string
  public async clear() {}
  public async print() {}
  private mockFileSystem: { [filepath: string]: string } | undefined
  constructor({
    rootPath,
    mockData,
  }: {
    rootPath?: string
    mockData: { [filepath: string]: string }
  }) {
    this.rootPath = rootPath || ''
    this.mockFileSystem = mockData
  }
  public async seed() {
    throw new Error(`Seeding data is not possible for InMemoryStore store`)
  }
  public async query(queryStrings: string[]): Promise<object[]> {
    throw new Error(`Unable to perform query for InMemoryStore store`)
  }

  public async get(filepath: string) {
    const value = this.mockFileSystem[filepath]
    if (!value) {
      throw new Error(`Unable to find record for ${filepath}`)
    }
    return parseFile(value, path.extname(filepath), (yup) => yup.object())
  }

  public supportsIndexing() {
    return false
  }
  public async glob(pattern: string, callback) {
    const items = []
    Object.entries(this.mockFileSystem).forEach(([key, value]) => {
      if (key.startsWith(pattern)) {
        items.push(key)
      }
    })
    if (callback) {
      return sequential(items, async (item) => {
        return callback(item)
      })
    } else {
      return items
    }
  }
  public async put(filepath: string, data: object) {
    this.mockFileSystem[filepath] = stringifyFile(
      data,
      path.extname(filepath),
      false
    )
  }
}

export const setup = async (
  rootPath: string,
  schema: TinaCloudSchema<false>,
  updateSnapshot?: boolean
): Promise<{
  database: Database
  schemaString: string
  expectedSchemaString: string
}> => {
  const bridge = new InMemoryBridge(rootPath)
  const mockData = await bridge.getMockData()
  // throw 'NO'
  const store = new InMemoryStore({
    rootPath: '',
    mockData,
  })
  const database = await createDatabase({
    bridge,
    store,
  })
  await indexDB({ database, config: schema })
  const schemaString = await database.getGraphQLSchema()
  // @ts-ignore
  const graphQLSchemaString = printSchema(buildASTSchema(schemaString))
  await fs.outputFileSync(
    path.join(rootPath, '.tina', '__generated__', 'schema.gql'),
    graphQLSchemaString
  )

  return {
    database,
    schemaString: 'hi',
    expectedSchemaString: 'hi',
    // schemaString: formattedSchemaString,
    // expectedSchemaString,
  }
}

export const setupFixture = async (
  rootPath: string,
  schema: TinaCloudSchema<false>,
  fixture: string
) => {
  const { database } = await setup(rootPath, schema)
  const request = await fs
    .readFileSync(path.join(rootPath, 'requests', fixture, 'request.gql'))
    .toString()
  const expectedReponse = await fs
    .readFileSync(path.join(rootPath, 'requests', fixture, 'response.json'))
    .toString()
  const expectedReponsePath = await path.join(
    rootPath,
    'requests',
    fixture,
    'response.json'
  )

  const response = await resolve({
    query: request,
    variables: {},
    database,
  })
  if (response.errors) {
    // console.log(response.errors)
  }

  return {
    response,
    expectedReponse,
    expectedReponsePath,
  }
}

export const setupFixture2 = async (
  rootPath: string,
  schema: TinaCloudSchema<false>,
  fixture: { name: string; assert: 'output' | 'file' }
) => {
  const { database } = await setup(rootPath, schema)
  const request = await fs
    .readFileSync(path.join(rootPath, 'requests', fixture.name, 'request.gql'))
    .toString()

  let variables = {}
  try {
    variables = JSON.parse(
      await fs
        .readFileSync(
          path.join(rootPath, 'requests', fixture.name, 'variables.json')
        )
        .toString()
    )
  } catch (e) {}
  const expectedResponsePath = await path.join(
    rootPath,
    'requests',
    fixture.name,
    fixture.assert === 'file' ? 'response.md' : 'response.json'
  )

  const response = await resolve({
    query: request,
    variables,
    database,
  })

  const responseString =
    fixture.assert === 'file'
      ? // @ts-ignore
        await database.bridge.get(fixture.filename)
      : `${JSON.stringify(response, null, 2)}\n`

  if (response.errors) {
    console.log(JSON.stringify(response.errors, null, 2))
  }

  return {
    response: responseString,
    expectedResponsePath,
  }
}
