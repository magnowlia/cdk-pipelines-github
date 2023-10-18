"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StackCapabilities = void 0;
/**
 * Acknowledge IAM resources in AWS CloudFormation templates.
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-template.html#capabilities
 */
var StackCapabilities;
(function (StackCapabilities) {
    /** Acknowledge your stack includes IAM resources */
    StackCapabilities["IAM"] = "CAPABILITY_IAM";
    /** Acknowledge your stack includes custom names for IAM resources */
    StackCapabilities["NAMED_IAM"] = "CAPABILITY_NAMED_IAM";
    /** Acknowledge your stack contains one or more macros */
    StackCapabilities["AUTO_EXPAND"] = "CAPABILITY_AUTO_EXPAND";
})(StackCapabilities = exports.StackCapabilities || (exports.StackCapabilities = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2Utb3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9zdGFnZS1vcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0dBSUc7QUFDSCxJQUFZLGlCQVNYO0FBVEQsV0FBWSxpQkFBaUI7SUFDM0Isb0RBQW9EO0lBQ3BELDJDQUFzQixDQUFBO0lBRXRCLHFFQUFxRTtJQUNyRSx1REFBa0MsQ0FBQTtJQUVsQyx5REFBeUQ7SUFDekQsMkRBQXNDLENBQUE7QUFDeEMsQ0FBQyxFQVRXLGlCQUFpQixHQUFqQix5QkFBaUIsS0FBakIseUJBQWlCLFFBUzVCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBY2tub3dsZWRnZSBJQU0gcmVzb3VyY2VzIGluIEFXUyBDbG91ZEZvcm1hdGlvbiB0ZW1wbGF0ZXMuXG4gKlxuICogQHNlZSBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vQVdTQ2xvdWRGb3JtYXRpb24vbGF0ZXN0L1VzZXJHdWlkZS91c2luZy1pYW0tdGVtcGxhdGUuaHRtbCNjYXBhYmlsaXRpZXNcbiAqL1xuZXhwb3J0IGVudW0gU3RhY2tDYXBhYmlsaXRpZXMge1xuICAvKiogQWNrbm93bGVkZ2UgeW91ciBzdGFjayBpbmNsdWRlcyBJQU0gcmVzb3VyY2VzICovXG4gIElBTSA9ICdDQVBBQklMSVRZX0lBTScsXG5cbiAgLyoqIEFja25vd2xlZGdlIHlvdXIgc3RhY2sgaW5jbHVkZXMgY3VzdG9tIG5hbWVzIGZvciBJQU0gcmVzb3VyY2VzICovXG4gIE5BTUVEX0lBTSA9ICdDQVBBQklMSVRZX05BTUVEX0lBTScsXG5cbiAgLyoqIEFja25vd2xlZGdlIHlvdXIgc3RhY2sgY29udGFpbnMgb25lIG9yIG1vcmUgbWFjcm9zICovXG4gIEFVVE9fRVhQQU5EID0gJ0NBUEFCSUxJVFlfQVVUT19FWFBBTkQnLFxufVxuIl19