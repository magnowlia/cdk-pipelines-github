"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonPatch = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
// copied from https://github.com/cdk8s-team/cdk8s-core/blob/6b317a7a6a2504e228bc56bf96fc98829f88c2be/src/json-patch.ts
// under Apache 2.0 license
const fast_json_patch_1 = require("fast-json-patch");
/**
 * Utility for applying RFC-6902 JSON-Patch to a document.
 *
 * Use the the `JsonPatch.apply(doc, ...ops)` function to apply a set of
 * operations to a JSON document and return the result.
 *
 * Operations can be created using the factory methods `JsonPatch.add()`,
 * `JsonPatch.remove()`, etc.
 *
 * const output = JsonPatch.apply(input,
 *   JsonPatch.replace('/world/hi/there', 'goodbye'),
 *   JsonPatch.add('/world/foo/', 'boom'),
 *   JsonPatch.remove('/hello'),
 * );
 *
 */
class JsonPatch {
    constructor(operation) {
        this.operation = operation;
    }
    /**
     * Applies a set of JSON-Patch (RFC-6902) operations to `document` and returns the result.
     * @param document The document to patch
     * @param ops The operations to apply
     * @returns The result document
     */
    static apply(document, ...ops) {
        const result = fast_json_patch_1.applyPatch(document, ops.map((o) => o._toJson()));
        return result.newDocument;
    }
    /**
     * Adds a value to an object or inserts it into an array. In the case of an
     * array, the value is inserted before the given index. The - character can be
     * used instead of an index to insert at the end of an array.
     *
     * @example JsonPatch.add('/biscuits/1', { "name": "Ginger Nut" })
     */
    static add(path, value) {
        return new JsonPatch({ op: 'add', path, value });
    }
    /**
     * Removes a value from an object or array.
     *
     * @example JsonPatch.remove('/biscuits')
     * @example JsonPatch.remove('/biscuits/0')
     */
    static remove(path) {
        return new JsonPatch({ op: 'remove', path });
    }
    /**
     * Replaces a value. Equivalent to a “remove” followed by an “add”.
     *
     * @example JsonPatch.replace('/biscuits/0/name', 'Chocolate Digestive')
     */
    static replace(path, value) {
        return new JsonPatch({ op: 'replace', path, value });
    }
    /**
     * Copies a value from one location to another within the JSON document. Both
     * from and path are JSON Pointers.
     *
     * @example JsonPatch.copy('/biscuits/0', '/best_biscuit')
     */
    static copy(from, path) {
        return new JsonPatch({ op: 'copy', from, path });
    }
    /**
     * Moves a value from one location to the other. Both from and path are JSON Pointers.
     *
     * @example JsonPatch.move('/biscuits', '/cookies')
     */
    static move(from, path) {
        return new JsonPatch({ op: 'move', from, path });
    }
    /**
     * Tests that the specified value is set in the document. If the test fails,
     * then the patch as a whole should not apply.
     *
     * @example JsonPatch.test('/best_biscuit/name', 'Choco Leibniz')
     */
    static test(path, value) {
        return new JsonPatch({ op: 'test', path, value });
    }
    /**
     * Returns the JSON representation of this JSON patch operation.
     *
     * @internal
     */
    _toJson() {
        return this.operation;
    }
}
exports.JsonPatch = JsonPatch;
_a = JSII_RTTI_SYMBOL_1;
JsonPatch[_a] = { fqn: "cdk-pipelines-github.JsonPatch", version: "0.0.0" };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbi1wYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9qc29uLXBhdGNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsdUhBQXVIO0FBQ3ZILDJCQUEyQjtBQUMzQixxREFBd0Q7QUFFeEQ7Ozs7Ozs7Ozs7Ozs7OztHQWVHO0FBQ0gsTUFBYSxTQUFTO0lBMEVwQixZQUFxQyxTQUFvQjtRQUFwQixjQUFTLEdBQVQsU0FBUyxDQUFXO0lBQUcsQ0FBQztJQXpFN0Q7Ozs7O09BS0c7SUFDSSxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQWEsRUFBRSxHQUFHLEdBQWdCO1FBQ3BELE1BQU0sTUFBTSxHQUFHLDRCQUFVLENBQ3ZCLFFBQVEsRUFDUixHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FDNUIsQ0FBQztRQUNGLE9BQU8sTUFBTSxDQUFDLFdBQVcsQ0FBQztJQUM1QixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0ksTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFZLEVBQUUsS0FBVTtRQUN4QyxPQUFPLElBQUksU0FBUyxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQVk7UUFDL0IsT0FBTyxJQUFJLFNBQVMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBWSxFQUFFLEtBQVU7UUFDNUMsT0FBTyxJQUFJLFNBQVMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFZLEVBQUUsSUFBWTtRQUMzQyxPQUFPLElBQUksU0FBUyxDQUFDLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBWSxFQUFFLElBQVk7UUFDM0MsT0FBTyxJQUFJLFNBQVMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFZLEVBQUUsS0FBVTtRQUN6QyxPQUFPLElBQUksU0FBUyxDQUFDLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBSUQ7Ozs7T0FJRztJQUNJLE9BQU87UUFDWixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQzs7QUFuRkgsOEJBb0ZDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gY29waWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2NkazhzLXRlYW0vY2RrOHMtY29yZS9ibG9iLzZiMzE3YTdhNmEyNTA0ZTIyOGJjNTZiZjk2ZmM5ODgyOWY4OGMyYmUvc3JjL2pzb24tcGF0Y2gudHNcbi8vIHVuZGVyIEFwYWNoZSAyLjAgbGljZW5zZVxuaW1wb3J0IHsgYXBwbHlQYXRjaCwgT3BlcmF0aW9uIH0gZnJvbSAnZmFzdC1qc29uLXBhdGNoJztcblxuLyoqXG4gKiBVdGlsaXR5IGZvciBhcHBseWluZyBSRkMtNjkwMiBKU09OLVBhdGNoIHRvIGEgZG9jdW1lbnQuXG4gKlxuICogVXNlIHRoZSB0aGUgYEpzb25QYXRjaC5hcHBseShkb2MsIC4uLm9wcylgIGZ1bmN0aW9uIHRvIGFwcGx5IGEgc2V0IG9mXG4gKiBvcGVyYXRpb25zIHRvIGEgSlNPTiBkb2N1bWVudCBhbmQgcmV0dXJuIHRoZSByZXN1bHQuXG4gKlxuICogT3BlcmF0aW9ucyBjYW4gYmUgY3JlYXRlZCB1c2luZyB0aGUgZmFjdG9yeSBtZXRob2RzIGBKc29uUGF0Y2guYWRkKClgLFxuICogYEpzb25QYXRjaC5yZW1vdmUoKWAsIGV0Yy5cbiAqXG4gKiBjb25zdCBvdXRwdXQgPSBKc29uUGF0Y2guYXBwbHkoaW5wdXQsXG4gKiAgIEpzb25QYXRjaC5yZXBsYWNlKCcvd29ybGQvaGkvdGhlcmUnLCAnZ29vZGJ5ZScpLFxuICogICBKc29uUGF0Y2guYWRkKCcvd29ybGQvZm9vLycsICdib29tJyksXG4gKiAgIEpzb25QYXRjaC5yZW1vdmUoJy9oZWxsbycpLFxuICogKTtcbiAqXG4gKi9cbmV4cG9ydCBjbGFzcyBKc29uUGF0Y2gge1xuICAvKipcbiAgICogQXBwbGllcyBhIHNldCBvZiBKU09OLVBhdGNoIChSRkMtNjkwMikgb3BlcmF0aW9ucyB0byBgZG9jdW1lbnRgIGFuZCByZXR1cm5zIHRoZSByZXN1bHQuXG4gICAqIEBwYXJhbSBkb2N1bWVudCBUaGUgZG9jdW1lbnQgdG8gcGF0Y2hcbiAgICogQHBhcmFtIG9wcyBUaGUgb3BlcmF0aW9ucyB0byBhcHBseVxuICAgKiBAcmV0dXJucyBUaGUgcmVzdWx0IGRvY3VtZW50XG4gICAqL1xuICBwdWJsaWMgc3RhdGljIGFwcGx5KGRvY3VtZW50OiBhbnksIC4uLm9wczogSnNvblBhdGNoW10pOiBhbnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGFwcGx5UGF0Y2goXG4gICAgICBkb2N1bWVudCxcbiAgICAgIG9wcy5tYXAoKG8pID0+IG8uX3RvSnNvbigpKSxcbiAgICApO1xuICAgIHJldHVybiByZXN1bHQubmV3RG9jdW1lbnQ7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyBhIHZhbHVlIHRvIGFuIG9iamVjdCBvciBpbnNlcnRzIGl0IGludG8gYW4gYXJyYXkuIEluIHRoZSBjYXNlIG9mIGFuXG4gICAqIGFycmF5LCB0aGUgdmFsdWUgaXMgaW5zZXJ0ZWQgYmVmb3JlIHRoZSBnaXZlbiBpbmRleC4gVGhlIC0gY2hhcmFjdGVyIGNhbiBiZVxuICAgKiB1c2VkIGluc3RlYWQgb2YgYW4gaW5kZXggdG8gaW5zZXJ0IGF0IHRoZSBlbmQgb2YgYW4gYXJyYXkuXG4gICAqXG4gICAqIEBleGFtcGxlIEpzb25QYXRjaC5hZGQoJy9iaXNjdWl0cy8xJywgeyBcIm5hbWVcIjogXCJHaW5nZXIgTnV0XCIgfSlcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgYWRkKHBhdGg6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgIHJldHVybiBuZXcgSnNvblBhdGNoKHsgb3A6ICdhZGQnLCBwYXRoLCB2YWx1ZSB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGEgdmFsdWUgZnJvbSBhbiBvYmplY3Qgb3IgYXJyYXkuXG4gICAqXG4gICAqIEBleGFtcGxlIEpzb25QYXRjaC5yZW1vdmUoJy9iaXNjdWl0cycpXG4gICAqIEBleGFtcGxlIEpzb25QYXRjaC5yZW1vdmUoJy9iaXNjdWl0cy8wJylcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgcmVtb3ZlKHBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBuZXcgSnNvblBhdGNoKHsgb3A6ICdyZW1vdmUnLCBwYXRoIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcGxhY2VzIGEgdmFsdWUuIEVxdWl2YWxlbnQgdG8gYSDigJxyZW1vdmXigJ0gZm9sbG93ZWQgYnkgYW4g4oCcYWRk4oCdLlxuICAgKlxuICAgKiBAZXhhbXBsZSBKc29uUGF0Y2gucmVwbGFjZSgnL2Jpc2N1aXRzLzAvbmFtZScsICdDaG9jb2xhdGUgRGlnZXN0aXZlJylcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgcmVwbGFjZShwYXRoOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgICByZXR1cm4gbmV3IEpzb25QYXRjaCh7IG9wOiAncmVwbGFjZScsIHBhdGgsIHZhbHVlIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENvcGllcyBhIHZhbHVlIGZyb20gb25lIGxvY2F0aW9uIHRvIGFub3RoZXIgd2l0aGluIHRoZSBKU09OIGRvY3VtZW50LiBCb3RoXG4gICAqIGZyb20gYW5kIHBhdGggYXJlIEpTT04gUG9pbnRlcnMuXG4gICAqXG4gICAqIEBleGFtcGxlIEpzb25QYXRjaC5jb3B5KCcvYmlzY3VpdHMvMCcsICcvYmVzdF9iaXNjdWl0JylcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgY29weShmcm9tOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBuZXcgSnNvblBhdGNoKHsgb3A6ICdjb3B5JywgZnJvbSwgcGF0aCB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNb3ZlcyBhIHZhbHVlIGZyb20gb25lIGxvY2F0aW9uIHRvIHRoZSBvdGhlci4gQm90aCBmcm9tIGFuZCBwYXRoIGFyZSBKU09OIFBvaW50ZXJzLlxuICAgKlxuICAgKiBAZXhhbXBsZSBKc29uUGF0Y2gubW92ZSgnL2Jpc2N1aXRzJywgJy9jb29raWVzJylcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgbW92ZShmcm9tOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiBuZXcgSnNvblBhdGNoKHsgb3A6ICdtb3ZlJywgZnJvbSwgcGF0aCB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUZXN0cyB0aGF0IHRoZSBzcGVjaWZpZWQgdmFsdWUgaXMgc2V0IGluIHRoZSBkb2N1bWVudC4gSWYgdGhlIHRlc3QgZmFpbHMsXG4gICAqIHRoZW4gdGhlIHBhdGNoIGFzIGEgd2hvbGUgc2hvdWxkIG5vdCBhcHBseS5cbiAgICpcbiAgICogQGV4YW1wbGUgSnNvblBhdGNoLnRlc3QoJy9iZXN0X2Jpc2N1aXQvbmFtZScsICdDaG9jbyBMZWlibml6JylcbiAgICovXG4gIHB1YmxpYyBzdGF0aWMgdGVzdChwYXRoOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgICByZXR1cm4gbmV3IEpzb25QYXRjaCh7IG9wOiAndGVzdCcsIHBhdGgsIHZhbHVlIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9wZXJhdGlvbjogT3BlcmF0aW9uKSB7fVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBKU09OIHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgSlNPTiBwYXRjaCBvcGVyYXRpb24uXG4gICAqXG4gICAqIEBpbnRlcm5hbFxuICAgKi9cbiAgcHVibGljIF90b0pzb24oKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5vcGVyYXRpb247XG4gIH1cbn1cbiJdfQ==