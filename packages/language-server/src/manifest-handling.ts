import { dirname } from "path";
import { maxBy, map, filter } from "lodash";
import { readFile } from "fs-extra";
import { URI } from "vscode-uri";
import globby from "globby";
import { FileChangeType } from "vscode-languageserver";

type AbsolutePath = string;
type ManifestData = Record<AbsolutePath, { flexEnabled: boolean }>;
const manifestData: ManifestData = Object.create(null);

export function isManifestDoc(uri: string): boolean {
  return uri.endsWith("manifest.json");
}

export async function initializeManifestData(
  workspaceFolderPath: string
): Promise<void[]> {
  const manifestDocuments = await findAllManifestDocumentsInWorkspace(
    workspaceFolderPath
  );

  const readManifestPromises = map(manifestDocuments, async (manifestDoc) => {
    const isFlexEnabled = await readFlexEnabledFlagFromManifestFile(
      manifestDoc
    );

    // Parsing of manifest.json failed because the file is invalid
    if (isFlexEnabled !== "INVALID") {
      manifestData[manifestDoc] = { flexEnabled: isFlexEnabled };
    }
  });

  return Promise.all(readManifestPromises);
}

export function getFlexEnabledFlagForXMLFile(xmlPath: string): boolean {
  const manifestFilesForCurrentFolder = filter(
    Object.keys(manifestData),
    (manifestPath) => xmlPath.startsWith(dirname(manifestPath))
  );

  const closestManifestPath = maxBy(
    manifestFilesForCurrentFolder,
    (manifestPath) => manifestPath.length
  );

  if (closestManifestPath === undefined) {
    return false;
  }

  return manifestData[closestManifestPath].flexEnabled;
}

export async function updateManifestData(
  manifestUri: string,
  changeType: FileChangeType
): Promise<void> {
  const manifestPath = URI.parse(manifestUri).fsPath;
  switch (changeType) {
    case 1: //created
    case 2: {
      //changed
      const isFlexEnabled = await readFlexEnabledFlagFromManifestFile(
        manifestUri
      );
      // Parsing of manifest.json failed because the file is invalid
      // We want to keep last successfully read state - manifset.json file may be actively edited
      if (isFlexEnabled !== "INVALID") {
        manifestData[manifestPath] = { flexEnabled: isFlexEnabled };
      }
      return;
    }
    case 3: //deleted
      delete manifestData[manifestPath];
      return;
  }
}

async function findAllManifestDocumentsInWorkspace(
  workspaceFolderPath: string
): Promise<string[]> {
  return globby(`${workspaceFolderPath}/**/manifest.json`);
}

async function readFlexEnabledFlagFromManifestFile(
  manifestUri: string
): Promise<boolean | "INVALID"> {
  const manifestContent = await readFile(
    URI.parse(manifestUri).fsPath,
    "utf-8"
  );

  let manifestJsonObject;
  try {
    manifestJsonObject = JSON.parse(manifestContent);
  } catch (err) {
    return "INVALID";
  }

  const ui5Object = manifestJsonObject["sap.ui5"] ?? { flexEnabled: false };
  const isFlexEnabled = ui5Object.flexEnabled;

  return isFlexEnabled;
}
