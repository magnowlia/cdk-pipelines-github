"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsCredentials = exports.AwsCredentialsProvider = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const aws_credentials_1 = require("./private/aws-credentials");
const github = require("./workflows-model");
/**
 * AWS credential provider
 */
class AwsCredentialsProvider {
}
exports.AwsCredentialsProvider = AwsCredentialsProvider;
_a = JSII_RTTI_SYMBOL_1;
AwsCredentialsProvider[_a] = { fqn: "cdk-pipelines-github.AwsCredentialsProvider", version: "0.0.0" };
/**
 * AWS credential provider from GitHub secrets
 */
class GitHubSecretsProvider extends AwsCredentialsProvider {
    constructor(props) {
        super();
        this.accessKeyId = props?.accessKeyId ?? 'AWS_ACCESS_KEY_ID';
        this.secretAccessKey = props?.secretAccessKey ?? 'AWS_SECRET_ACCESS_KEY';
        this.sessionToken = props?.sessionToken;
    }
    jobPermission() {
        return github.JobPermission.NONE;
    }
    credentialSteps(region, assumeRoleArn) {
        return [
            aws_credentials_1.awsCredentialStep('Authenticate Via GitHub Secrets', {
                region,
                accessKeyId: `\${{ secrets.${this.accessKeyId} }}`,
                secretAccessKey: `\${{ secrets.${this.secretAccessKey} }}`,
                ...(this.sessionToken ? {
                    sessionToken: `\${{ secrets.${this.sessionToken} }}`,
                } : undefined),
                ...(assumeRoleArn ? {
                    roleToAssume: assumeRoleArn,
                    roleExternalId: 'Pipeline',
                } : undefined),
            }),
        ];
    }
}
/**
 * AWS credential provider from OpenId Connect
 */
class OpenIdConnectProvider extends AwsCredentialsProvider {
    constructor(props) {
        super();
        this.gitHubActionRoleArn = props.gitHubActionRoleArn;
        this.roleSessionName = props.roleSessionName;
    }
    jobPermission() {
        return github.JobPermission.WRITE;
    }
    credentialSteps(region, assumeRoleArn) {
        function getDeployRole(arn) {
            return arn.replace('cfn-exec', 'deploy');
        }
        let steps = [];
        steps.push(aws_credentials_1.awsCredentialStep('Authenticate Via OIDC Role', {
            region,
            roleToAssume: this.gitHubActionRoleArn,
            roleSessionName: this.roleSessionName,
        }));
        if (assumeRoleArn) {
            // Result of initial credentials with GitHub Action role are these environment variables
            steps.push(aws_credentials_1.awsCredentialStep('Assume CDK Deploy Role', {
                region,
                accessKeyId: '${{ env.AWS_ACCESS_KEY_ID }}',
                secretAccessKey: '${{ env.AWS_SECRET_ACCESS_KEY }}',
                sessionToken: '${{ env.AWS_SESSION_TOKEN }}',
                roleToAssume: getDeployRole(assumeRoleArn),
                roleExternalId: 'Pipeline',
            }));
        }
        return steps;
    }
}
/**
 * Dummy AWS credential provider
 */
class NoCredentialsProvider extends AwsCredentialsProvider {
    jobPermission() {
        return github.JobPermission.NONE;
    }
    credentialSteps(_region, _assumeRoleArn) {
        return [];
    }
}
/**
 * Provides AWS credenitals to the pipeline jobs
 */
class AwsCredentials {
    /**
     * Reference credential secrets to authenticate with AWS. This method assumes
     * that your credentials will be stored as long-lived GitHub Secrets.
     */
    static fromGitHubSecrets(props) {
        return new GitHubSecretsProvider(props);
    }
    /**
     * Provide AWS credentials using OpenID Connect.
     */
    static fromOpenIdConnect(props) {
        return new OpenIdConnectProvider(props);
    }
    /**
     * Don't provide any AWS credentials, use this if runners have preconfigured credentials.
     */
    static runnerHasPreconfiguredCreds() {
        return new NoCredentialsProvider();
    }
}
exports.AwsCredentials = AwsCredentials;
_b = JSII_RTTI_SYMBOL_1;
AwsCredentials[_b] = { fqn: "cdk-pipelines-github.AwsCredentials", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXdzLWNyZWRlbnRpYWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2F3cy1jcmVkZW50aWFscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLCtEQUE4RDtBQUM5RCw0Q0FBNEM7QUFFNUM7O0dBRUc7QUFDSCxNQUFzQixzQkFBc0I7O0FBQTVDLHdEQUdDOzs7QUFzQkQ7O0dBRUc7QUFDSCxNQUFNLHFCQUFzQixTQUFRLHNCQUFzQjtJQUt4RCxZQUFZLEtBQWtDO1FBQzVDLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLEVBQUUsV0FBVyxJQUFJLG1CQUFtQixDQUFDO1FBQzdELElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxFQUFFLGVBQWUsSUFBSSx1QkFBdUIsQ0FBQztRQUN6RSxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssRUFBRSxZQUFZLENBQUM7SUFDMUMsQ0FBQztJQUVNLGFBQWE7UUFDbEIsT0FBTyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQztJQUNuQyxDQUFDO0lBRU0sZUFBZSxDQUFDLE1BQWMsRUFBRSxhQUFzQjtRQUMzRCxPQUFPO1lBQ0wsbUNBQWlCLENBQUMsaUNBQWlDLEVBQUU7Z0JBQ25ELE1BQU07Z0JBQ04sV0FBVyxFQUFFLGdCQUFnQixJQUFJLENBQUMsV0FBVyxLQUFLO2dCQUNsRCxlQUFlLEVBQUUsZ0JBQWdCLElBQUksQ0FBQyxlQUFlLEtBQUs7Z0JBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztvQkFDdEIsWUFBWSxFQUFFLGdCQUFnQixJQUFJLENBQUMsWUFBWSxLQUFLO2lCQUNyRCxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7Z0JBQ2QsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7b0JBQ2xCLFlBQVksRUFBRSxhQUFhO29CQUMzQixjQUFjLEVBQUUsVUFBVTtpQkFDM0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2FBQ2YsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0NBQ0Y7QUF1QkQ7O0dBRUc7QUFDSCxNQUFNLHFCQUFzQixTQUFRLHNCQUFzQjtJQUl4RCxZQUFZLEtBQWlDO1FBQzNDLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQztRQUNyRCxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUM7SUFDL0MsQ0FBQztJQUVNLGFBQWE7UUFDbEIsT0FBTyxNQUFNLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztJQUNwQyxDQUFDO0lBRU0sZUFBZSxDQUFDLE1BQWMsRUFBRSxhQUFzQjtRQUMzRCxTQUFTLGFBQWEsQ0FBQyxHQUFXO1lBQ2hDLE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUVELElBQUksS0FBSyxHQUFxQixFQUFFLENBQUM7UUFFakMsS0FBSyxDQUFDLElBQUksQ0FDUixtQ0FBaUIsQ0FBQyw0QkFBNEIsRUFBRTtZQUM5QyxNQUFNO1lBQ04sWUFBWSxFQUFFLElBQUksQ0FBQyxtQkFBbUI7WUFDdEMsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlO1NBQ3RDLENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSxhQUFhLEVBQUU7WUFDakIsd0ZBQXdGO1lBQ3hGLEtBQUssQ0FBQyxJQUFJLENBQ1IsbUNBQWlCLENBQUMsd0JBQXdCLEVBQUU7Z0JBQzFDLE1BQU07Z0JBQ04sV0FBVyxFQUFFLDhCQUE4QjtnQkFDM0MsZUFBZSxFQUFFLGtDQUFrQztnQkFDbkQsWUFBWSxFQUFFLDhCQUE4QjtnQkFDNUMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxhQUFhLENBQUM7Z0JBQzFDLGNBQWMsRUFBRSxVQUFVO2FBQzNCLENBQUMsQ0FDSCxDQUFDO1NBQ0g7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7Q0FDRjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxxQkFBc0IsU0FBUSxzQkFBc0I7SUFDakQsYUFBYTtRQUNsQixPQUFPLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDO0lBQ25DLENBQUM7SUFDTSxlQUFlLENBQUMsT0FBZSxFQUFFLGNBQXVCO1FBQzdELE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQztDQUNGO0FBRUQ7O0dBRUc7QUFDSCxNQUFhLGNBQWM7SUFDekI7OztPQUdHO0lBQ0gsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEtBQWtDO1FBQ3pELE9BQU8sSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsaUJBQWlCLENBQUMsS0FBaUM7UUFDeEQsT0FBTyxJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQywyQkFBMkI7UUFDaEMsT0FBTyxJQUFJLHFCQUFxQixFQUFFLENBQUM7SUFDckMsQ0FBQzs7QUFyQkgsd0NBc0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYXdzQ3JlZGVudGlhbFN0ZXAgfSBmcm9tICcuL3ByaXZhdGUvYXdzLWNyZWRlbnRpYWxzJztcbmltcG9ydCAqIGFzIGdpdGh1YiBmcm9tICcuL3dvcmtmbG93cy1tb2RlbCc7XG5cbi8qKlxuICogQVdTIGNyZWRlbnRpYWwgcHJvdmlkZXJcbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEF3c0NyZWRlbnRpYWxzUHJvdmlkZXIge1xuICBwdWJsaWMgYWJzdHJhY3Qgam9iUGVybWlzc2lvbigpOiBnaXRodWIuSm9iUGVybWlzc2lvbjtcbiAgcHVibGljIGFic3RyYWN0IGNyZWRlbnRpYWxTdGVwcyhyZWdpb246IHN0cmluZywgYXNzdW1lUm9sZUFybj86IHN0cmluZyk6IGdpdGh1Yi5Kb2JTdGVwW107XG59XG5cbi8qKlxuICogTG9jYXRpb25zIG9mIEdpdEh1YiBTZWNyZXRzIHVzZWQgdG8gYXV0aGVudGljYXRlIHRvIEFXU1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEdpdEh1YlNlY3JldHNQcm92aWRlclByb3BzIHtcbiAgLyoqXG4gICAqIEBkZWZhdWx0IFwiQVdTX0FDQ0VTU19LRVlfSURcIlxuICAgKi9cbiAgcmVhZG9ubHkgYWNjZXNzS2V5SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGRlZmF1bHQgXCJBV1NfU0VDUkVUX0FDQ0VTU19LRVlcIlxuICAgKi9cbiAgcmVhZG9ubHkgc2VjcmV0QWNjZXNzS2V5OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IC0gbm8gc2Vzc2lvbiB0b2tlbiBpcyB1c2VkXG4gICAqL1xuICByZWFkb25seSBzZXNzaW9uVG9rZW4/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQVdTIGNyZWRlbnRpYWwgcHJvdmlkZXIgZnJvbSBHaXRIdWIgc2VjcmV0c1xuICovXG5jbGFzcyBHaXRIdWJTZWNyZXRzUHJvdmlkZXIgZXh0ZW5kcyBBd3NDcmVkZW50aWFsc1Byb3ZpZGVyIHtcbiAgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NLZXlJZDogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHNlY3JldEFjY2Vzc0tleTogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25Ub2tlbj86IHN0cmluZztcblxuICBjb25zdHJ1Y3Rvcihwcm9wcz86IEdpdEh1YlNlY3JldHNQcm92aWRlclByb3BzKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLmFjY2Vzc0tleUlkID0gcHJvcHM/LmFjY2Vzc0tleUlkID8/ICdBV1NfQUNDRVNTX0tFWV9JRCc7XG4gICAgdGhpcy5zZWNyZXRBY2Nlc3NLZXkgPSBwcm9wcz8uc2VjcmV0QWNjZXNzS2V5ID8/ICdBV1NfU0VDUkVUX0FDQ0VTU19LRVknO1xuICAgIHRoaXMuc2Vzc2lvblRva2VuID0gcHJvcHM/LnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHB1YmxpYyBqb2JQZXJtaXNzaW9uKCk6IGdpdGh1Yi5Kb2JQZXJtaXNzaW9uIHtcbiAgICByZXR1cm4gZ2l0aHViLkpvYlBlcm1pc3Npb24uTk9ORTtcbiAgfVxuXG4gIHB1YmxpYyBjcmVkZW50aWFsU3RlcHMocmVnaW9uOiBzdHJpbmcsIGFzc3VtZVJvbGVBcm4/OiBzdHJpbmcpOiBnaXRodWIuSm9iU3RlcFtdIHtcbiAgICByZXR1cm4gW1xuICAgICAgYXdzQ3JlZGVudGlhbFN0ZXAoJ0F1dGhlbnRpY2F0ZSBWaWEgR2l0SHViIFNlY3JldHMnLCB7XG4gICAgICAgIHJlZ2lvbixcbiAgICAgICAgYWNjZXNzS2V5SWQ6IGBcXCR7eyBzZWNyZXRzLiR7dGhpcy5hY2Nlc3NLZXlJZH0gfX1gLFxuICAgICAgICBzZWNyZXRBY2Nlc3NLZXk6IGBcXCR7eyBzZWNyZXRzLiR7dGhpcy5zZWNyZXRBY2Nlc3NLZXl9IH19YCxcbiAgICAgICAgLi4uKHRoaXMuc2Vzc2lvblRva2VuID8ge1xuICAgICAgICAgIHNlc3Npb25Ub2tlbjogYFxcJHt7IHNlY3JldHMuJHt0aGlzLnNlc3Npb25Ub2tlbn0gfX1gLFxuICAgICAgICB9IDogdW5kZWZpbmVkKSxcbiAgICAgICAgLi4uKGFzc3VtZVJvbGVBcm4gPyB7XG4gICAgICAgICAgcm9sZVRvQXNzdW1lOiBhc3N1bWVSb2xlQXJuLFxuICAgICAgICAgIHJvbGVFeHRlcm5hbElkOiAnUGlwZWxpbmUnLFxuICAgICAgICB9IDogdW5kZWZpbmVkKSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxuLyoqXG4gKiBSb2xlIHRvIGFzc3VtZSB1c2luZyBPcGVuSWQgQ29ubmVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIE9wZW5JZENvbm5lY3RQcm92aWRlclByb3BzIHtcbiAgLyoqXG4gICAqIEEgcm9sZSB0aGF0IHV0aWxpemVzIHRoZSBHaXRIdWIgT0lEQyBJZGVudGl0eSBQcm92aWRlciBpbiB5b3VyIEFXUyBhY2NvdW50LlxuICAgKlxuICAgKiBZb3UgY2FuIGNyZWF0ZSB5b3VyIG93biByb2xlIGluIHRoZSBjb25zb2xlIHdpdGggdGhlIG5lY2Vzc2FyeSB0cnVzdCBwb2xpY3lcbiAgICogdG8gYWxsb3cgZ2l0SHViIGFjdGlvbnMgZnJvbSB5b3VyIGdpdEh1YiByZXBvc2l0b3J5IHRvIGFzc3VtZSB0aGUgcm9sZSwgb3JcbiAgICogeW91IGNhbiB1dGlsaXplIHRoZSBgR2l0SHViQWN0aW9uUm9sZWAgY29uc3RydWN0IHRvIGNyZWF0ZSBhIHJvbGUgZm9yIHlvdS5cbiAgICovXG4gIHJlYWRvbmx5IGdpdEh1YkFjdGlvblJvbGVBcm46IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIHJvbGUgc2Vzc2lvbiBuYW1lIHRvIHVzZSB3aGVuIGFzc3VtaW5nIHRoZSByb2xlLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIG5vIHJvbGUgc2Vzc2lvbiBuYW1lXG4gICAqL1xuICByZWFkb25seSByb2xlU2Vzc2lvbk5hbWU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQVdTIGNyZWRlbnRpYWwgcHJvdmlkZXIgZnJvbSBPcGVuSWQgQ29ubmVjdFxuICovXG5jbGFzcyBPcGVuSWRDb25uZWN0UHJvdmlkZXIgZXh0ZW5kcyBBd3NDcmVkZW50aWFsc1Byb3ZpZGVyIHtcbiAgcHJpdmF0ZSByZWFkb25seSBnaXRIdWJBY3Rpb25Sb2xlQXJuOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgcm9sZVNlc3Npb25OYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgY29uc3RydWN0b3IocHJvcHM6IE9wZW5JZENvbm5lY3RQcm92aWRlclByb3BzKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLmdpdEh1YkFjdGlvblJvbGVBcm4gPSBwcm9wcy5naXRIdWJBY3Rpb25Sb2xlQXJuO1xuICAgIHRoaXMucm9sZVNlc3Npb25OYW1lID0gcHJvcHMucm9sZVNlc3Npb25OYW1lO1xuICB9XG5cbiAgcHVibGljIGpvYlBlcm1pc3Npb24oKTogZ2l0aHViLkpvYlBlcm1pc3Npb24ge1xuICAgIHJldHVybiBnaXRodWIuSm9iUGVybWlzc2lvbi5XUklURTtcbiAgfVxuXG4gIHB1YmxpYyBjcmVkZW50aWFsU3RlcHMocmVnaW9uOiBzdHJpbmcsIGFzc3VtZVJvbGVBcm4/OiBzdHJpbmcpOiBnaXRodWIuSm9iU3RlcFtdIHtcbiAgICBmdW5jdGlvbiBnZXREZXBsb3lSb2xlKGFybjogc3RyaW5nKSB7XG4gICAgICByZXR1cm4gYXJuLnJlcGxhY2UoJ2Nmbi1leGVjJywgJ2RlcGxveScpO1xuICAgIH1cblxuICAgIGxldCBzdGVwczogZ2l0aHViLkpvYlN0ZXBbXSA9IFtdO1xuXG4gICAgc3RlcHMucHVzaChcbiAgICAgIGF3c0NyZWRlbnRpYWxTdGVwKCdBdXRoZW50aWNhdGUgVmlhIE9JREMgUm9sZScsIHtcbiAgICAgICAgcmVnaW9uLFxuICAgICAgICByb2xlVG9Bc3N1bWU6IHRoaXMuZ2l0SHViQWN0aW9uUm9sZUFybixcbiAgICAgICAgcm9sZVNlc3Npb25OYW1lOiB0aGlzLnJvbGVTZXNzaW9uTmFtZSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAoYXNzdW1lUm9sZUFybikge1xuICAgICAgLy8gUmVzdWx0IG9mIGluaXRpYWwgY3JlZGVudGlhbHMgd2l0aCBHaXRIdWIgQWN0aW9uIHJvbGUgYXJlIHRoZXNlIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgICAgc3RlcHMucHVzaChcbiAgICAgICAgYXdzQ3JlZGVudGlhbFN0ZXAoJ0Fzc3VtZSBDREsgRGVwbG95IFJvbGUnLCB7XG4gICAgICAgICAgcmVnaW9uLFxuICAgICAgICAgIGFjY2Vzc0tleUlkOiAnJHt7IGVudi5BV1NfQUNDRVNTX0tFWV9JRCB9fScsXG4gICAgICAgICAgc2VjcmV0QWNjZXNzS2V5OiAnJHt7IGVudi5BV1NfU0VDUkVUX0FDQ0VTU19LRVkgfX0nLFxuICAgICAgICAgIHNlc3Npb25Ub2tlbjogJyR7eyBlbnYuQVdTX1NFU1NJT05fVE9LRU4gfX0nLFxuICAgICAgICAgIHJvbGVUb0Fzc3VtZTogZ2V0RGVwbG95Um9sZShhc3N1bWVSb2xlQXJuKSxcbiAgICAgICAgICByb2xlRXh0ZXJuYWxJZDogJ1BpcGVsaW5lJyxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiBzdGVwcztcbiAgfVxufVxuXG4vKipcbiAqIER1bW15IEFXUyBjcmVkZW50aWFsIHByb3ZpZGVyXG4gKi9cbmNsYXNzIE5vQ3JlZGVudGlhbHNQcm92aWRlciBleHRlbmRzIEF3c0NyZWRlbnRpYWxzUHJvdmlkZXIge1xuICBwdWJsaWMgam9iUGVybWlzc2lvbigpOiBnaXRodWIuSm9iUGVybWlzc2lvbiB7XG4gICAgcmV0dXJuIGdpdGh1Yi5Kb2JQZXJtaXNzaW9uLk5PTkU7XG4gIH1cbiAgcHVibGljIGNyZWRlbnRpYWxTdGVwcyhfcmVnaW9uOiBzdHJpbmcsIF9hc3N1bWVSb2xlQXJuPzogc3RyaW5nKTogZ2l0aHViLkpvYlN0ZXBbXSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG59XG5cbi8qKlxuICogUHJvdmlkZXMgQVdTIGNyZWRlbml0YWxzIHRvIHRoZSBwaXBlbGluZSBqb2JzXG4gKi9cbmV4cG9ydCBjbGFzcyBBd3NDcmVkZW50aWFscyB7XG4gIC8qKlxuICAgKiBSZWZlcmVuY2UgY3JlZGVudGlhbCBzZWNyZXRzIHRvIGF1dGhlbnRpY2F0ZSB3aXRoIEFXUy4gVGhpcyBtZXRob2QgYXNzdW1lc1xuICAgKiB0aGF0IHlvdXIgY3JlZGVudGlhbHMgd2lsbCBiZSBzdG9yZWQgYXMgbG9uZy1saXZlZCBHaXRIdWIgU2VjcmV0cy5cbiAgICovXG4gIHN0YXRpYyBmcm9tR2l0SHViU2VjcmV0cyhwcm9wcz86IEdpdEh1YlNlY3JldHNQcm92aWRlclByb3BzKTogQXdzQ3JlZGVudGlhbHNQcm92aWRlciB7XG4gICAgcmV0dXJuIG5ldyBHaXRIdWJTZWNyZXRzUHJvdmlkZXIocHJvcHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb3ZpZGUgQVdTIGNyZWRlbnRpYWxzIHVzaW5nIE9wZW5JRCBDb25uZWN0LlxuICAgKi9cbiAgc3RhdGljIGZyb21PcGVuSWRDb25uZWN0KHByb3BzOiBPcGVuSWRDb25uZWN0UHJvdmlkZXJQcm9wcyk6IEF3c0NyZWRlbnRpYWxzUHJvdmlkZXIge1xuICAgIHJldHVybiBuZXcgT3BlbklkQ29ubmVjdFByb3ZpZGVyKHByb3BzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEb24ndCBwcm92aWRlIGFueSBBV1MgY3JlZGVudGlhbHMsIHVzZSB0aGlzIGlmIHJ1bm5lcnMgaGF2ZSBwcmVjb25maWd1cmVkIGNyZWRlbnRpYWxzLlxuICAgKi9cbiAgc3RhdGljIHJ1bm5lckhhc1ByZWNvbmZpZ3VyZWRDcmVkcygpOiBBd3NDcmVkZW50aWFsc1Byb3ZpZGVyIHtcbiAgICByZXR1cm4gbmV3IE5vQ3JlZGVudGlhbHNQcm92aWRlcigpO1xuICB9XG59XG4iXX0=