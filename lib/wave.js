"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubWave = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const pipelines_1 = require("aws-cdk-lib/pipelines");
/**
 * Multiple stages that are deployed in parallel
 *
 * A `Wave`, but with addition GitHub options
 *
 * Create with `GitHubWorkflow.addWave()` or `GitHubWorkflow.addGitHubWave()`.
 * You should not have to instantiate a GitHubWave yourself.
 */
class GitHubWave extends pipelines_1.Wave {
    /**
     * Create with `GitHubWorkflow.addWave()` or `GitHubWorkflow.addGitHubWave()`.
     * You should not have to instantiate a GitHubWave yourself.
     */
    constructor(
    /** Identifier for this Wave */
    id, 
    /** GitHubWorkflow that this wave is part of  */
    pipeline, props = {}) {
        super(id, props);
        this.id = id;
        this.pipeline = pipeline;
    }
    /**
     * Add a Stage to this wave
     *
     * It will be deployed in parallel with all other stages in this
     * wave.
     */
    addStage(stage, options = {}) {
        return this.addStageWithGitHubOptions(stage, options);
    }
    /**
     * Add a Stage to this wave
     *
     * It will be deployed in parallel with all other stages in this
     * wave.
     */
    addStageWithGitHubOptions(stage, options) {
        const stageDeployment = super.addStage(stage, options);
        this.pipeline._addStageFromWave(stage, stageDeployment, options);
        return stageDeployment;
    }
}
exports.GitHubWave = GitHubWave;
_a = JSII_RTTI_SYMBOL_1;
GitHubWave[_a] = { fqn: "cdk-pipelines-github.GitHubWave", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F2ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy93YXZlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQ0EscURBQXVGO0FBSXZGOzs7Ozs7O0dBT0c7QUFFSCxNQUFhLFVBQVcsU0FBUSxnQkFBSTtJQUVsQzs7O09BR0c7SUFDSDtJQUNFLCtCQUErQjtJQUNmLEVBQVU7SUFDMUIsZ0RBQWdEO0lBQ3hDLFFBQXdCLEVBQ2hDLFFBQW1CLEVBQUU7UUFFckIsS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUxELE9BQUUsR0FBRixFQUFFLENBQVE7UUFFbEIsYUFBUSxHQUFSLFFBQVEsQ0FBZ0I7SUFJbEMsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksUUFBUSxDQUFDLEtBQVksRUFBRSxVQUF3QixFQUFFO1FBQ3RELE9BQU8sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSx5QkFBeUIsQ0FDOUIsS0FBWSxFQUNaLE9BQStCO1FBRS9CLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNqRSxPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDOztBQXZDSCxnQ0F3Q0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdGFnZSB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEFkZFN0YWdlT3B0cywgU3RhZ2VEZXBsb3ltZW50LCBXYXZlLCBXYXZlUHJvcHMgfSBmcm9tICdhd3MtY2RrLWxpYi9waXBlbGluZXMnO1xuaW1wb3J0IHsgQWRkR2l0SHViU3RhZ2VPcHRpb25zIH0gZnJvbSAnLi9naXRodWItY29tbW9uJztcbmltcG9ydCB7IEdpdEh1YldvcmtmbG93IH0gZnJvbSAnLi9waXBlbGluZSc7XG5cbi8qKlxuICogTXVsdGlwbGUgc3RhZ2VzIHRoYXQgYXJlIGRlcGxveWVkIGluIHBhcmFsbGVsXG4gKlxuICogQSBgV2F2ZWAsIGJ1dCB3aXRoIGFkZGl0aW9uIEdpdEh1YiBvcHRpb25zXG4gKlxuICogQ3JlYXRlIHdpdGggYEdpdEh1YldvcmtmbG93LmFkZFdhdmUoKWAgb3IgYEdpdEh1YldvcmtmbG93LmFkZEdpdEh1YldhdmUoKWAuXG4gKiBZb3Ugc2hvdWxkIG5vdCBoYXZlIHRvIGluc3RhbnRpYXRlIGEgR2l0SHViV2F2ZSB5b3Vyc2VsZi5cbiAqL1xuXG5leHBvcnQgY2xhc3MgR2l0SHViV2F2ZSBleHRlbmRzIFdhdmUge1xuXG4gIC8qKlxuICAgKiBDcmVhdGUgd2l0aCBgR2l0SHViV29ya2Zsb3cuYWRkV2F2ZSgpYCBvciBgR2l0SHViV29ya2Zsb3cuYWRkR2l0SHViV2F2ZSgpYC5cbiAgICogWW91IHNob3VsZCBub3QgaGF2ZSB0byBpbnN0YW50aWF0ZSBhIEdpdEh1YldhdmUgeW91cnNlbGYuXG4gICAqL1xuICBwdWJsaWMgY29uc3RydWN0b3IoXG4gICAgLyoqIElkZW50aWZpZXIgZm9yIHRoaXMgV2F2ZSAqL1xuICAgIHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuICAgIC8qKiBHaXRIdWJXb3JrZmxvdyB0aGF0IHRoaXMgd2F2ZSBpcyBwYXJ0IG9mICAqL1xuICAgIHByaXZhdGUgcGlwZWxpbmU6IEdpdEh1YldvcmtmbG93LFxuICAgIHByb3BzOiBXYXZlUHJvcHMgPSB7fSxcbiAgKSB7XG4gICAgc3VwZXIoaWQsIHByb3BzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBTdGFnZSB0byB0aGlzIHdhdmVcbiAgICpcbiAgICogSXQgd2lsbCBiZSBkZXBsb3llZCBpbiBwYXJhbGxlbCB3aXRoIGFsbCBvdGhlciBzdGFnZXMgaW4gdGhpc1xuICAgKiB3YXZlLlxuICAgKi9cbiAgcHVibGljIGFkZFN0YWdlKHN0YWdlOiBTdGFnZSwgb3B0aW9uczogQWRkU3RhZ2VPcHRzID0ge30pIHtcbiAgICByZXR1cm4gdGhpcy5hZGRTdGFnZVdpdGhHaXRIdWJPcHRpb25zKHN0YWdlLCBvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBTdGFnZSB0byB0aGlzIHdhdmVcbiAgICpcbiAgICogSXQgd2lsbCBiZSBkZXBsb3llZCBpbiBwYXJhbGxlbCB3aXRoIGFsbCBvdGhlciBzdGFnZXMgaW4gdGhpc1xuICAgKiB3YXZlLlxuICAgKi9cbiAgcHVibGljIGFkZFN0YWdlV2l0aEdpdEh1Yk9wdGlvbnMoXG4gICAgc3RhZ2U6IFN0YWdlLFxuICAgIG9wdGlvbnM/OiBBZGRHaXRIdWJTdGFnZU9wdGlvbnMsXG4gICk6IFN0YWdlRGVwbG95bWVudCB7XG4gICAgY29uc3Qgc3RhZ2VEZXBsb3ltZW50ID0gc3VwZXIuYWRkU3RhZ2Uoc3RhZ2UsIG9wdGlvbnMpO1xuICAgIHRoaXMucGlwZWxpbmUuX2FkZFN0YWdlRnJvbVdhdmUoc3RhZ2UsIHN0YWdlRGVwbG95bWVudCwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHN0YWdlRGVwbG95bWVudDtcbiAgfVxufVxuIl19