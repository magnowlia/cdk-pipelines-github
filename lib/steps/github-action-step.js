"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubActionStep = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const pipelines_1 = require("aws-cdk-lib/pipelines");
/**
 * Specifies a GitHub Action as a step in the pipeline.
 */
class GitHubActionStep extends pipelines_1.Step {
    constructor(id, props) {
        super(id);
        this.jobSteps = props.jobSteps;
        this.env = props.env ?? {};
    }
}
exports.GitHubActionStep = GitHubActionStep;
_a = JSII_RTTI_SYMBOL_1;
GitHubActionStep[_a] = { fqn: "cdk-pipelines-github.GitHubActionStep", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViLWFjdGlvbi1zdGVwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3N0ZXBzL2dpdGh1Yi1hY3Rpb24tc3RlcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHFEQUE2QztBQWU3Qzs7R0FFRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsZ0JBQUk7SUFJeEMsWUFBWSxFQUFVLEVBQUUsS0FBNEI7UUFDbEQsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ1YsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQy9CLElBQUksQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUM7SUFDN0IsQ0FBQzs7QUFSSCw0Q0FTQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFN0ZXAgfSBmcm9tICdhd3MtY2RrLWxpYi9waXBlbGluZXMnO1xuaW1wb3J0IHsgSm9iU3RlcCB9IGZyb20gJy4uL3dvcmtmbG93cy1tb2RlbCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2l0SHViQWN0aW9uU3RlcFByb3BzIHtcbiAgLyoqXG4gICAqIFRoZSBKb2Igc3RlcHMuXG4gICAqL1xuICByZWFkb25seSBqb2JTdGVwczogSm9iU3RlcFtdO1xuXG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCB2YXJpYWJsZXMgdG8gc2V0LlxuICAgKi9cbiAgcmVhZG9ubHkgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuLyoqXG4gKiBTcGVjaWZpZXMgYSBHaXRIdWIgQWN0aW9uIGFzIGEgc3RlcCBpbiB0aGUgcGlwZWxpbmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBHaXRIdWJBY3Rpb25TdGVwIGV4dGVuZHMgU3RlcCB7XG4gIHB1YmxpYyByZWFkb25seSBlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIHB1YmxpYyByZWFkb25seSBqb2JTdGVwczogSm9iU3RlcFtdO1xuXG4gIGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHByb3BzOiBHaXRIdWJBY3Rpb25TdGVwUHJvcHMpIHtcbiAgICBzdXBlcihpZCk7XG4gICAgdGhpcy5qb2JTdGVwcyA9IHByb3BzLmpvYlN0ZXBzO1xuICAgIHRoaXMuZW52ID0gcHJvcHMuZW52ID8/IHt9O1xuICB9XG59XG4iXX0=