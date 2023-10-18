"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubActionRole = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const constructs_1 = require("constructs");
/**
 * GitHub OIDC thumbprints updated 2023-07-27
 *
 * https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws/
 */
const GITHUB_OIDC_THUMBPRINTS = [
    '6938fd4d98bab03faadb97b34396831e3780aea1',
    '1c58a3a8518e8759bf075b76b750d4f2df264fcd',
];
/**
 * Creates or references a GitHub OIDC provider and accompanying role that trusts the provider.
 * This role can be used to authenticate against AWS instead of using long-lived AWS user credentials
 * stored in GitHub secrets.
 *
 * You can do this manually in the console, or create a separate stack that uses this construct.
 * You must `cdk deploy` once (with your normal AWS credentials) to have this role created for you.
 *
 * You can then make note of the role arn in the stack output and send it into the Github Workflow app via
 * the `gitHubActionRoleArn` property. The role arn will be `arn:aws:iam::<accountId>:role/GithubActionRole`.
 *
 * @see https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
 */
class GitHubActionRole extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const rawEndpoint = 'token.actions.githubusercontent.com';
        const providerUrl = `https://${rawEndpoint}`;
        // uses the given provider or creates a new one.
        const provider = props.provider ?? new iam.OpenIdConnectProvider(this, 'github-provider', {
            url: providerUrl,
            clientIds: ['sts.amazonaws.com'],
            thumbprints: props.thumbprints ?? GITHUB_OIDC_THUMBPRINTS,
        });
        // create a role that references the provider as a trusted entity
        const principal = new iam.FederatedPrincipal(provider.openIdConnectProviderArn, {
            StringLike: {
                [`${rawEndpoint}:sub`]: formatRepos(props.repos),
            },
        }, 'sts:AssumeRoleWithWebIdentity');
        // permit this role from assuming all of the CDK bootstrap roles
        const oidcPolicyStatement = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: ['*'],
            conditions: {
                'ForAnyValue:StringEquals': {
                    'iam:ResourceTag/aws-cdk:bootstrap-role': [
                        'deploy',
                        'lookup',
                        'file-publishing',
                        'image-publishing',
                    ],
                },
            },
        });
        // permit this role from accessing ecr repositories for docker assets
        const ecrPolicyStatement = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ecr:GetAuthorizationToken'],
            resources: ['*'],
        });
        this.role = new iam.Role(this, 'github-action-role', {
            roleName: props.roleName ?? 'GitHubActionRole',
            assumedBy: principal,
            inlinePolicies: {
                AssumeBootstrapRoles: new iam.PolicyDocument({
                    statements: [oidcPolicyStatement, ecrPolicyStatement],
                }),
            },
        });
        // show the role arn in the stack output
        new aws_cdk_lib_1.CfnOutput(this, 'roleArn', {
            value: this.role.roleArn,
        });
    }
    /**
     * Reference an existing GitHub Actions provider.
     * You do not need to pass in an arn because the arn for such
     * a provider is always the same.
     */
    static existingGitHubActionsProvider(scope) {
        return iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(scope, 'GitHubActionProvider', `arn:aws:iam::${aws_cdk_lib_1.Aws.ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com`);
    }
}
exports.GitHubActionRole = GitHubActionRole;
_a = JSII_RTTI_SYMBOL_1;
GitHubActionRole[_a] = { fqn: "cdk-pipelines-github.GitHubActionRole", version: "0.0.0" };
function formatRepos(repos) {
    const formattedRepos = [];
    for (const repo of repos) {
        formattedRepos.push(`repo:${repo}:*`);
    }
    return formattedRepos;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2lkYy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9vaWRjLXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsNkNBQTZDO0FBQzdDLDJDQUEyQztBQUMzQywyQ0FBdUM7QUFFdkM7Ozs7R0FJRztBQUNILE1BQU0sdUJBQXVCLEdBQUc7SUFDOUIsMENBQTBDO0lBQzFDLDBDQUEwQztDQUMzQyxDQUFDO0FBK0NGOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFzQjdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNEI7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFdBQVcsR0FBRyxxQ0FBcUMsQ0FBQztRQUMxRCxNQUFNLFdBQVcsR0FBRyxXQUFXLFdBQVcsRUFBRSxDQUFDO1FBRTdDLGdEQUFnRDtRQUNoRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxJQUFJLElBQUksR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN4RixHQUFHLEVBQUUsV0FBVztZQUNoQixTQUFTLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQztZQUNoQyxXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVcsSUFBSSx1QkFBdUI7U0FDMUQsQ0FBQyxDQUFDO1FBRUgsaUVBQWlFO1FBQ2pFLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFDLGtCQUFrQixDQUMxQyxRQUFRLENBQUMsd0JBQXdCLEVBQ2pDO1lBQ0UsVUFBVSxFQUFFO2dCQUNWLENBQUMsR0FBRyxXQUFXLE1BQU0sQ0FBQyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO2FBQ2pEO1NBQ0YsRUFDRCwrQkFBK0IsQ0FDaEMsQ0FBQztRQUVGLGdFQUFnRTtRQUNoRSxNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUNsRCxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDO1lBQzNCLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNoQixVQUFVLEVBQUU7Z0JBQ1YsMEJBQTBCLEVBQUU7b0JBQzFCLHdDQUF3QyxFQUFFO3dCQUN4QyxRQUFRO3dCQUNSLFFBQVE7d0JBQ1IsaUJBQWlCO3dCQUNqQixrQkFBa0I7cUJBQ25CO2lCQUNGO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxxRUFBcUU7UUFDckUsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDakQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQywyQkFBMkIsQ0FBQztZQUN0QyxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDakIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ25ELFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxJQUFJLGtCQUFrQjtZQUM5QyxTQUFTLEVBQUUsU0FBUztZQUNwQixjQUFjLEVBQUU7Z0JBQ2Qsb0JBQW9CLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUMzQyxVQUFVLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxrQkFBa0IsQ0FBQztpQkFDdEQsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsd0NBQXdDO1FBQ3hDLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQzdCLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU87U0FDekIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQW5GRDs7OztPQUlHO0lBQ0ksTUFBTSxDQUFDLDZCQUE2QixDQUFDLEtBQWdCO1FBQzFELE9BQU8sR0FBRyxDQUFDLHFCQUFxQixDQUFDLDRCQUE0QixDQUMzRCxLQUFLLEVBQ0wsc0JBQXNCLEVBQ3RCLGdCQUFnQixpQkFBRyxDQUFDLFVBQVUsb0RBQW9ELENBQ25GLENBQUM7SUFDSixDQUFDOztBQVpILDRDQXFGQzs7O0FBRUQsU0FBUyxXQUFXLENBQUMsS0FBZTtJQUNsQyxNQUFNLGNBQWMsR0FBRyxFQUFFLENBQUM7SUFDMUIsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUU7UUFDeEIsY0FBYyxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLENBQUM7S0FDdkM7SUFDRCxPQUFPLGNBQWMsQ0FBQztBQUN4QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXdzLCBDZm5PdXRwdXQgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLyoqXG4gKiBHaXRIdWIgT0lEQyB0aHVtYnByaW50cyB1cGRhdGVkIDIwMjMtMDctMjdcbiAqXG4gKiBodHRwczovL2dpdGh1Yi5ibG9nL2NoYW5nZWxvZy8yMDIzLTA2LTI3LWdpdGh1Yi1hY3Rpb25zLXVwZGF0ZS1vbi1vaWRjLWludGVncmF0aW9uLXdpdGgtYXdzL1xuICovXG5jb25zdCBHSVRIVUJfT0lEQ19USFVNQlBSSU5UUyA9IFtcbiAgJzY5MzhmZDRkOThiYWIwM2ZhYWRiOTdiMzQzOTY4MzFlMzc4MGFlYTEnLFxuICAnMWM1OGEzYTg1MThlODc1OWJmMDc1Yjc2Yjc1MGQ0ZjJkZjI2NGZjZCcsXG5dO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIHRoZSBHaXRIdWJBY3Rpb25Sb2xlIGNvbnN0cnVjdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBHaXRIdWJBY3Rpb25Sb2xlUHJvcHMge1xuICAvKipcbiAgICogQSBsaXN0IG9mIEdpdEh1YiByZXBvc2l0b3JpZXMgeW91IHdhbnQgdG8gYmUgYWJsZSB0byBhY2Nlc3MgdGhlIElBTSByb2xlLlxuICAgKiBFYWNoIGVudHJ5IHNob3VsZCBiZSB5b3VyIEdpdEh1YiB1c2VybmFtZSBhbmQgcmVwb3NpdG9yeSBwYXNzZWQgaW4gYXMgYVxuICAgKiBzaW5nbGUgc3RyaW5nLlxuICAgKlxuICAgKiBGb3IgZXhhbXBsZSwgYFsnb3duZXIvcmVwbzEnLCAnb3duZXIvcmVwbzInXS5cbiAgICovXG4gIHJlYWRvbmx5IHJlcG9zOiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogVGhlIG5hbWUgb2YgdGhlIE9pZGMgcm9sZS5cbiAgICpcbiAgICogQGRlZmF1bHQgJ0dpdEh1YkFjdGlvblJvbGUnXG4gICAqL1xuICByZWFkb25seSByb2xlTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogVGhlIEdpdEh1YiBPcGVuSWQgQ29ubmVjdCBQcm92aWRlci4gTXVzdCBoYXZlIHByb3ZpZGVyIHVybFxuICAgKiBgaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWAuIFRoZSBhdWRpZW5jZSBtdXN0IGJlXG4gICAqIGBzdHM6YW1hem9uYXdzLmNvbWAuXG4gICAqXG4gICAqIE9ubHkgb25lIHN1Y2ggcHJvdmlkZXIgY2FuIGJlIGRlZmluZWQgcGVyIGFjY291bnQsIHNvIGlmIHlvdSBhbHJlYWR5XG4gICAqIGhhdmUgYSBwcm92aWRlciB3aXRoIHRoZSBzYW1lIHVybCwgYSBuZXcgcHJvdmlkZXIgY2Fubm90IGJlIGNyZWF0ZWQgZm9yIHlvdS5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBhIHByb3ZpZGVyIGlzIGNyZWF0ZWQgZm9yIHlvdS5cbiAgICovXG4gIHJlYWRvbmx5IHByb3ZpZGVyPzogaWFtLklPcGVuSWRDb25uZWN0UHJvdmlkZXI7XG5cbiAgLyoqXG4gICAqIFRodW1icHJpbnRzIG9mIEdpdEh1YidzIGNlcnRpZmljYXRlc1xuICAgKlxuICAgKiBFdmVyeSB0aW1lIEdpdEh1YiByb3RhdGVzIHRoZWlyIGNlcnRpZmljYXRlcywgdGhpcyB2YWx1ZSB3aWxsIG5lZWQgdG8gYmUgdXBkYXRlZC5cbiAgICpcbiAgICogRGVmYXVsdCB2YWx1ZSBpcyB1cC10by1kYXRlIHRvIEp1bmUgMjcsIDIwMjMgYXMgcGVyXG4gICAqIGh0dHBzOi8vZ2l0aHViLmJsb2cvY2hhbmdlbG9nLzIwMjMtMDYtMjctZ2l0aHViLWFjdGlvbnMtdXBkYXRlLW9uLW9pZGMtaW50ZWdyYXRpb24td2l0aC1hd3MvXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gVXNlIGJ1aWx0LWluIGtleXNcbiAgICovXG4gIHJlYWRvbmx5IHRodW1icHJpbnRzPzogc3RyaW5nW107XG59XG5cbi8qKlxuICogQ3JlYXRlcyBvciByZWZlcmVuY2VzIGEgR2l0SHViIE9JREMgcHJvdmlkZXIgYW5kIGFjY29tcGFueWluZyByb2xlIHRoYXQgdHJ1c3RzIHRoZSBwcm92aWRlci5cbiAqIFRoaXMgcm9sZSBjYW4gYmUgdXNlZCB0byBhdXRoZW50aWNhdGUgYWdhaW5zdCBBV1MgaW5zdGVhZCBvZiB1c2luZyBsb25nLWxpdmVkIEFXUyB1c2VyIGNyZWRlbnRpYWxzXG4gKiBzdG9yZWQgaW4gR2l0SHViIHNlY3JldHMuXG4gKlxuICogWW91IGNhbiBkbyB0aGlzIG1hbnVhbGx5IGluIHRoZSBjb25zb2xlLCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBzdGFjayB0aGF0IHVzZXMgdGhpcyBjb25zdHJ1Y3QuXG4gKiBZb3UgbXVzdCBgY2RrIGRlcGxveWAgb25jZSAod2l0aCB5b3VyIG5vcm1hbCBBV1MgY3JlZGVudGlhbHMpIHRvIGhhdmUgdGhpcyByb2xlIGNyZWF0ZWQgZm9yIHlvdS5cbiAqXG4gKiBZb3UgY2FuIHRoZW4gbWFrZSBub3RlIG9mIHRoZSByb2xlIGFybiBpbiB0aGUgc3RhY2sgb3V0cHV0IGFuZCBzZW5kIGl0IGludG8gdGhlIEdpdGh1YiBXb3JrZmxvdyBhcHAgdmlhXG4gKiB0aGUgYGdpdEh1YkFjdGlvblJvbGVBcm5gIHByb3BlcnR5LiBUaGUgcm9sZSBhcm4gd2lsbCBiZSBgYXJuOmF3czppYW06OjxhY2NvdW50SWQ+OnJvbGUvR2l0aHViQWN0aW9uUm9sZWAuXG4gKlxuICogQHNlZSBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9hY3Rpb25zL2RlcGxveW1lbnQvc2VjdXJpdHktaGFyZGVuaW5nLXlvdXItZGVwbG95bWVudHMvY29uZmlndXJpbmctb3BlbmlkLWNvbm5lY3QtaW4tYW1hem9uLXdlYi1zZXJ2aWNlc1xuICovXG5leHBvcnQgY2xhc3MgR2l0SHViQWN0aW9uUm9sZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBSZWZlcmVuY2UgYW4gZXhpc3RpbmcgR2l0SHViIEFjdGlvbnMgcHJvdmlkZXIuXG4gICAqIFlvdSBkbyBub3QgbmVlZCB0byBwYXNzIGluIGFuIGFybiBiZWNhdXNlIHRoZSBhcm4gZm9yIHN1Y2hcbiAgICogYSBwcm92aWRlciBpcyBhbHdheXMgdGhlIHNhbWUuXG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGV4aXN0aW5nR2l0SHViQWN0aW9uc1Byb3ZpZGVyKHNjb3BlOiBDb25zdHJ1Y3QpOiBpYW0uSU9wZW5JZENvbm5lY3RQcm92aWRlciB7XG4gICAgcmV0dXJuIGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIuZnJvbU9wZW5JZENvbm5lY3RQcm92aWRlckFybihcbiAgICAgIHNjb3BlLFxuICAgICAgJ0dpdEh1YkFjdGlvblByb3ZpZGVyJyxcbiAgICAgIGBhcm46YXdzOmlhbTo6JHtBd3MuQUNDT1VOVF9JRH06b2lkYy1wcm92aWRlci90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbWAsXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgcm9sZSB0aGF0IGdldHMgY3JlYXRlZC5cbiAgICpcbiAgICogWW91IHNob3VsZCB1c2UgdGhlIGFybiBvZiB0aGlzIHJvbGUgYXMgaW5wdXQgdG8gdGhlIGBnaXRIdWJBY3Rpb25Sb2xlQXJuYFxuICAgKiBwcm9wZXJ0eSBpbiB5b3VyIEdpdEh1YiBXb3JrZmxvdyBhcHAuXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcm9sZTogaWFtLklSb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBHaXRIdWJBY3Rpb25Sb2xlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgcmF3RW5kcG9pbnQgPSAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nO1xuICAgIGNvbnN0IHByb3ZpZGVyVXJsID0gYGh0dHBzOi8vJHtyYXdFbmRwb2ludH1gO1xuXG4gICAgLy8gdXNlcyB0aGUgZ2l2ZW4gcHJvdmlkZXIgb3IgY3JlYXRlcyBhIG5ldyBvbmUuXG4gICAgY29uc3QgcHJvdmlkZXIgPSBwcm9wcy5wcm92aWRlciA/PyBuZXcgaWFtLk9wZW5JZENvbm5lY3RQcm92aWRlcih0aGlzLCAnZ2l0aHViLXByb3ZpZGVyJywge1xuICAgICAgdXJsOiBwcm92aWRlclVybCxcbiAgICAgIGNsaWVudElkczogWydzdHMuYW1hem9uYXdzLmNvbSddLFxuICAgICAgdGh1bWJwcmludHM6IHByb3BzLnRodW1icHJpbnRzID8/IEdJVEhVQl9PSURDX1RIVU1CUFJJTlRTLFxuICAgIH0pO1xuXG4gICAgLy8gY3JlYXRlIGEgcm9sZSB0aGF0IHJlZmVyZW5jZXMgdGhlIHByb3ZpZGVyIGFzIGEgdHJ1c3RlZCBlbnRpdHlcbiAgICBjb25zdCBwcmluY2lwYWwgPSBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgIHByb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgIHtcbiAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgIFtgJHtyYXdFbmRwb2ludH06c3ViYF06IGZvcm1hdFJlcG9zKHByb3BzLnJlcG9zKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknLFxuICAgICk7XG5cbiAgICAvLyBwZXJtaXQgdGhpcyByb2xlIGZyb20gYXNzdW1pbmcgYWxsIG9mIHRoZSBDREsgYm9vdHN0cmFwIHJvbGVzXG4gICAgY29uc3Qgb2lkY1BvbGljeVN0YXRlbWVudCA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnc3RzOkFzc3VtZVJvbGUnXSxcbiAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICAgJ2lhbTpSZXNvdXJjZVRhZy9hd3MtY2RrOmJvb3RzdHJhcC1yb2xlJzogW1xuICAgICAgICAgICAgJ2RlcGxveScsXG4gICAgICAgICAgICAnbG9va3VwJyxcbiAgICAgICAgICAgICdmaWxlLXB1Ymxpc2hpbmcnLFxuICAgICAgICAgICAgJ2ltYWdlLXB1Ymxpc2hpbmcnLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gcGVybWl0IHRoaXMgcm9sZSBmcm9tIGFjY2Vzc2luZyBlY3IgcmVwb3NpdG9yaWVzIGZvciBkb2NrZXIgYXNzZXRzXG4gICAgY29uc3QgZWNyUG9saWN5U3RhdGVtZW50ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgIH0pO1xuXG4gICAgdGhpcy5yb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdnaXRodWItYWN0aW9uLXJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogcHJvcHMucm9sZU5hbWUgPz8gJ0dpdEh1YkFjdGlvblJvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBwcmluY2lwYWwsXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBBc3N1bWVCb290c3RyYXBSb2xlczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW29pZGNQb2xpY3lTdGF0ZW1lbnQsIGVjclBvbGljeVN0YXRlbWVudF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIHNob3cgdGhlIHJvbGUgYXJuIGluIHRoZSBzdGFjayBvdXRwdXRcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdyb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMucm9sZS5yb2xlQXJuLFxuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFJlcG9zKHJlcG9zOiBzdHJpbmdbXSkge1xuICBjb25zdCBmb3JtYXR0ZWRSZXBvcyA9IFtdO1xuICBmb3IgKGNvbnN0IHJlcG8gb2YgcmVwb3MpIHtcbiAgICBmb3JtYXR0ZWRSZXBvcy5wdXNoKGByZXBvOiR7cmVwb306KmApO1xuICB9XG4gIHJldHVybiBmb3JtYXR0ZWRSZXBvcztcbn0iXX0=