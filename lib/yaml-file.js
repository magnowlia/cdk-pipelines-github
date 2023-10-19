"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.YamlFile = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const fs_1 = require("fs");
const YAML = require("yaml");
const json_patch_1 = require("./json-patch");
/**
 * Represents a Yaml File.
 */
class YamlFile {
    constructor(filePath, options = {}) {
        this.filePath = filePath;
        this.obj = options.obj ?? {};
        this.patchOperations = [];
        // default value for commentAtTop
        this.commentAtTop = `AUTOMATICALLY GENERATED FILE, DO NOT EDIT MANUALLY.
Generated by AWS CDK and [cdk-pipelines-github](https://github.com/cdklabs/cdk-pipelines-github)`;
    }
    /**
     * Update the output object.
     */
    update(obj) {
        this.obj = obj;
    }
    /**
     * Applies an RFC 6902 JSON-patch to the synthesized object file.
     * See https://datatracker.ietf.org/doc/html/rfc6902 for more information.
     *
     * For example, with the following yaml file
     * ```yaml
     * name: deploy
     * on:
     *   push:
     *     branches:
     *       - main
     *   workflow_dispatch: {}
     * ...
     * ```
     *
     * modified in the following way:
     *
     * ```ts
     * declare const pipeline: GitHubWorkflow;
     * pipeline.workflowFile.patch(JsonPatch.add("/on/workflow_call", "{}"));
     * pipeline.workflowFile.patch(JsonPatch.remove("/on/workflow_dispatch"));
     * ```
     *
     * would result in the following yaml file:
     *
     * ```yaml
     * name: deploy
     * on:
     *   push:
     *     branches:
     *       - main
     *   workflow_call: {}
     * ...
     * ```
     *
     * @param patches - The patch operations to apply
     */
    patch(...patches) {
        this.patchOperations.push(...patches);
    }
    /**
     * Returns the patched yaml file.
     */
    toYaml() {
        const obj = JSON.parse(JSON.stringify(this.obj));
        const patched = json_patch_1.JsonPatch.apply(obj, ...this.patchOperations);
        const yamlDoc = new YAML.Document(patched);
        yamlDoc.commentBefore = this.commentAtTop ?? null;
        return yamlDoc.toString({
            commentString: (comment) => comment.split('\n').map((x) => x == '' ? '' : `# ${x}`).join('\n'),
            indent: 2,
        });
    }
    /**
     * Write the patched yaml file to the specified location.
     */
    writeFile() {
        fs_1.writeFileSync(this.filePath, this.toYaml());
    }
}
exports.YamlFile = YamlFile;
_a = JSII_RTTI_SYMBOL_1;
YamlFile[_a] = { fqn: "cdk-pipelines-github.YamlFile", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieWFtbC1maWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3lhbWwtZmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLDJCQUFtQztBQUNuQyw2QkFBNkI7QUFDN0IsNkNBQXlDO0FBZXpDOztHQUVHO0FBQ0gsTUFBYSxRQUFRO0lBeUNuQixZQUFZLFFBQWdCLEVBQUUsVUFBMkIsRUFBRTtRQUN6RCxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO1FBRTFCLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsWUFBWSxHQUFHO2lHQUN5RSxDQUFDO0lBQ2hHLENBQUM7SUFFRDs7T0FFRztJQUNJLE1BQU0sQ0FBQyxHQUFRO1FBQ3BCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09Bb0NHO0lBQ0ksS0FBSyxDQUFDLEdBQUcsT0FBb0I7UUFDbEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQ7O09BRUc7SUFDSSxNQUFNO1FBQ1gsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sT0FBTyxHQUFHLHNCQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUU5RCxNQUFNLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsT0FBTyxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQztRQUVsRCxPQUFPLE9BQU8sQ0FBQyxRQUFRLENBQUM7WUFDdEIsYUFBYSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FDekIsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDcEUsTUFBTSxFQUFFLENBQUM7U0FDVixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxTQUFTO1FBQ2Qsa0JBQWEsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLENBQUM7O0FBekhILDRCQTBIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHdyaXRlRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBZQU1MIGZyb20gJ3lhbWwnO1xuaW1wb3J0IHsgSnNvblBhdGNoIH0gZnJvbSAnLi9qc29uLXBhdGNoJztcblxuLyoqXG4gKiBPcHRpb25zIGZvciBgWWFtbEZpbGVgXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgWWFtbEZpbGVPcHRpb25zIHtcbiAgLyoqXG4gICAqIFRoZSBvYmplY3QgdGhhdCB3aWxsIGJlIHNlcmlhbGl6ZWQuIFlvdSBjYW4gbW9kaWZ5IHRoZSBvYmplY3QncyBjb250ZW50c1xuICAgKiBiZWZvcmUgc3ludGhlc2lzLlxuICAgKlxuICAgKiBAZGVmYXVsdCB7fSBhbiBlbXB0eSBvYmplY3RcbiAgICovXG4gIHJlYWRvbmx5IG9iaj86IGFueTtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgWWFtbCBGaWxlLlxuICovXG5leHBvcnQgY2xhc3MgWWFtbEZpbGUge1xuICAvKipcbiAgICogVGhlIHBhdGggdG8gdGhlIGZpbGUgdGhhdCB0aGUgb2JqZWN0IHdpbGwgYmUgd3JpdHRlbiB0by5cbiAgICovXG4gIHByaXZhdGUgcmVhZG9ubHkgZmlsZVBhdGg6IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIG91dHB1dCBvYmplY3QuIFRoaXMgb2JqZWN0IGNhbiBiZSBtdXRhdGVkIHVudGlsIHRoZSBwcm9qZWN0IGlzIHN5bnRoZXNpemVkLlxuICAgKi9cbiAgcHJpdmF0ZSBvYmo6IG9iamVjdDtcblxuICAvKipcbiAgICogUGF0Y2hlcyB0byBiZSBhcHBsaWVkIHRvIGBvYmpgIGFmdGVyIHRoZSByZXNvbHZlciBpcyBjYWxsZWQuXG4gICAqL1xuICBwcml2YXRlIHJlYWRvbmx5IHBhdGNoT3BlcmF0aW9uczogSnNvblBhdGNoW107XG5cbiAgLyoqXG4gICAqIEEgY29tbWVudCB0byBiZSBhZGRlZCB0byB0aGUgdG9wIG9mIHRoZSBZQU1MIGZpbGUuXG4gICAqXG4gICAqIENhbiBiZSBtdWx0aWxpbmUuIEFsbCBub24tZW1wdHkgbGluZSBhcmUgcGVmaXhlZCB3aXRoICcjICcuIEVtcHR5IGxpbmVzIGFyZSBrZXB0LCBidXQgbm90IGNvbW1lbnRlZC5cbiAgICpcbiAgICogRm9yIGV4YW1wbGU6XG4gICAqIGBgYHRzXG4gICAqIGRlY2xhcmUgY29uc3QgcGlwZWxpbmU6IEdpdEh1YldvcmtmbG93O1xuICAgKiBwaXBlbGluZS53b3JrZmxvd0ZpbGUuY29tbWVudEF0VG9wID1cbiAgICogYEFVVE9HRU5FUkFURUQgRklMRSwgRE8gTk9UIEVESVQhXG4gICAqIFNlZSBSZWFkTWUubWRcbiAgICogYDtcbiAgICogYGBgXG4gICAqXG4gICAqIFJlc3VsdHMgaW4gWUFNTDpcbiAgICogYGBgeWFtbFxuICAgKiAjIEFVVE9HRU5FUkFURUQgRklMRSwgRE8gTk9UIEVESVQhXG4gICAqICMgU2VlIFJlYWRNZS5tZFxuICAgKlxuICAgKiBuYW1lOiBkZXBsb3lcbiAgICogLi4uXG4gICAqIGBgYFxuICAgKi9cbiAgcHVibGljIGNvbW1lbnRBdFRvcD86IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihmaWxlUGF0aDogc3RyaW5nLCBvcHRpb25zOiBZYW1sRmlsZU9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMuZmlsZVBhdGggPSBmaWxlUGF0aDtcbiAgICB0aGlzLm9iaiA9IG9wdGlvbnMub2JqID8/IHt9O1xuICAgIHRoaXMucGF0Y2hPcGVyYXRpb25zID0gW107XG5cbiAgICAvLyBkZWZhdWx0IHZhbHVlIGZvciBjb21tZW50QXRUb3BcbiAgICB0aGlzLmNvbW1lbnRBdFRvcCA9IGBBVVRPTUFUSUNBTExZIEdFTkVSQVRFRCBGSUxFLCBETyBOT1QgRURJVCBNQU5VQUxMWS5cbkdlbmVyYXRlZCBieSBBV1MgQ0RLIGFuZCBbY2RrLXBpcGVsaW5lcy1naXRodWJdKGh0dHBzOi8vZ2l0aHViLmNvbS9jZGtsYWJzL2Nkay1waXBlbGluZXMtZ2l0aHViKWA7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIHRoZSBvdXRwdXQgb2JqZWN0LlxuICAgKi9cbiAgcHVibGljIHVwZGF0ZShvYmo6IGFueSkge1xuICAgIHRoaXMub2JqID0gb2JqO1xuICB9XG5cbiAgLyoqXG4gICAqIEFwcGxpZXMgYW4gUkZDIDY5MDIgSlNPTi1wYXRjaCB0byB0aGUgc3ludGhlc2l6ZWQgb2JqZWN0IGZpbGUuXG4gICAqIFNlZSBodHRwczovL2RhdGF0cmFja2VyLmlldGYub3JnL2RvYy9odG1sL3JmYzY5MDIgZm9yIG1vcmUgaW5mb3JtYXRpb24uXG4gICAqXG4gICAqIEZvciBleGFtcGxlLCB3aXRoIHRoZSBmb2xsb3dpbmcgeWFtbCBmaWxlXG4gICAqIGBgYHlhbWxcbiAgICogbmFtZTogZGVwbG95XG4gICAqIG9uOlxuICAgKiAgIHB1c2g6XG4gICAqICAgICBicmFuY2hlczpcbiAgICogICAgICAgLSBtYWluXG4gICAqICAgd29ya2Zsb3dfZGlzcGF0Y2g6IHt9XG4gICAqIC4uLlxuICAgKiBgYGBcbiAgICpcbiAgICogbW9kaWZpZWQgaW4gdGhlIGZvbGxvd2luZyB3YXk6XG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGRlY2xhcmUgY29uc3QgcGlwZWxpbmU6IEdpdEh1YldvcmtmbG93O1xuICAgKiBwaXBlbGluZS53b3JrZmxvd0ZpbGUucGF0Y2goSnNvblBhdGNoLmFkZChcIi9vbi93b3JrZmxvd19jYWxsXCIsIFwie31cIikpO1xuICAgKiBwaXBlbGluZS53b3JrZmxvd0ZpbGUucGF0Y2goSnNvblBhdGNoLnJlbW92ZShcIi9vbi93b3JrZmxvd19kaXNwYXRjaFwiKSk7XG4gICAqIGBgYFxuICAgKlxuICAgKiB3b3VsZCByZXN1bHQgaW4gdGhlIGZvbGxvd2luZyB5YW1sIGZpbGU6XG4gICAqXG4gICAqIGBgYHlhbWxcbiAgICogbmFtZTogZGVwbG95XG4gICAqIG9uOlxuICAgKiAgIHB1c2g6XG4gICAqICAgICBicmFuY2hlczpcbiAgICogICAgICAgLSBtYWluXG4gICAqICAgd29ya2Zsb3dfY2FsbDoge31cbiAgICogLi4uXG4gICAqIGBgYFxuICAgKlxuICAgKiBAcGFyYW0gcGF0Y2hlcyAtIFRoZSBwYXRjaCBvcGVyYXRpb25zIHRvIGFwcGx5XG4gICAqL1xuICBwdWJsaWMgcGF0Y2goLi4ucGF0Y2hlczogSnNvblBhdGNoW10pIHtcbiAgICB0aGlzLnBhdGNoT3BlcmF0aW9ucy5wdXNoKC4uLnBhdGNoZXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIHBhdGNoZWQgeWFtbCBmaWxlLlxuICAgKi9cbiAgcHVibGljIHRvWWFtbCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IG9iaiA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodGhpcy5vYmopKTtcbiAgICBjb25zdCBwYXRjaGVkID0gSnNvblBhdGNoLmFwcGx5KG9iaiwgLi4udGhpcy5wYXRjaE9wZXJhdGlvbnMpO1xuXG4gICAgY29uc3QgeWFtbERvYyA9IG5ldyBZQU1MLkRvY3VtZW50KHBhdGNoZWQpO1xuICAgIHlhbWxEb2MuY29tbWVudEJlZm9yZSA9IHRoaXMuY29tbWVudEF0VG9wID8/IG51bGw7XG5cbiAgICByZXR1cm4geWFtbERvYy50b1N0cmluZyh7XG4gICAgICBjb21tZW50U3RyaW5nOiAoY29tbWVudCkgPT5cbiAgICAgICAgY29tbWVudC5zcGxpdCgnXFxuJykubWFwKCh4KSA9PiB4ID09ICcnID8gJycgOiBgIyAke3h9YCkuam9pbignXFxuJyksXG4gICAgICBpbmRlbnQ6IDIsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogV3JpdGUgdGhlIHBhdGNoZWQgeWFtbCBmaWxlIHRvIHRoZSBzcGVjaWZpZWQgbG9jYXRpb24uXG4gICAqL1xuICBwdWJsaWMgd3JpdGVGaWxlKCkge1xuICAgIHdyaXRlRmlsZVN5bmModGhpcy5maWxlUGF0aCwgdGhpcy50b1lhbWwoKSk7XG4gIH1cbn1cbiJdfQ==