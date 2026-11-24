# Thiết kế điều phối subagent cho Claude Code

Bản đề xuất để duyệt ngày 24/11/2026. Phạm vi đầu tiên là **review code và đối chiếu test hiện có** trong phiên Claude Code local.

## Trải nghiệm mong muốn

**Mặc định, askills chỉ đề xuất cho người dùng.** Với `review @src/core/agent-runner.ts cho tôi nhé`, Claude chính review file với skill phù hợp. Với `review cách runner xử lý lỗi thoát tiến trình và đối chiếu riêng các test liên quan`, askills có thể hiển thị một dòng:

> Có thể chia phần này cho hai subagent: một bên rà cách runner xử lý lỗi, một bên đối chiếu các test liên quan.

Claude chính tiếp tục yêu cầu hiện tại ngay cả khi người dùng bỏ qua gợi ý. Nếu muốn giao việc, người dùng có thể nói `dùng hai subagent cho hai phần trên`. Đây là yêu cầu trực tiếp gửi tới Claude Code, có hiệu lực cho công việc đó. Nếu prompt đầu tiên đã yêu cầu dùng subagent rõ ràng, Claude có thể thực hiện ngay. Người dùng không cần xác nhận lần hai.

Giá trị cần chứng minh ở bản đầu là gợi ý đúng lúc, giúp người dùng thấy hai đầu việc có thể tách. Lợi ích và chi phí của việc giao việc được đo riêng trong các lượt người dùng chủ động yêu cầu.

## Điểm tích hợp

Hook hiện nhận prompt, giải tham chiếu `@file`, gọi `resolveTask` và gửi tên skill qua `additionalContext`. Với câu yêu cầu review cả code và test, chạy thử hiện tại trả `/code-review`, `/concise-engineering-output` và `/tdd`. Danh sách này chưa biểu diễn ai làm việc gì. Hàm `spawnAgent` hiện tại khởi chạy cả CLI của trợ lý từ terminal. [Hook của Claude Code](../src/commands/claude-hook.ts) · [Resolver](../src/core/task-routing.ts) · [Lệnh khởi chạy CLI](../src/core/agent-runner.ts)

**Bản đầu chỉ thêm lời đề xuất vào `systemMessage` của `UserPromptSubmit`.** Phần `additionalContext` của hook tiếp tục mang gợi ý skill hiện có. Hook không gửi chỉ thị gọi `Agent`, lưu kế hoạch chờ duyệt hay tạo file trong `.claude/agents/`. Điểm cuối này quan trọng vì Claude Code có thể tự chọn một agent đã đăng ký dựa trên mô tả của nó. Các subagent có sẵn của Claude Code vẫn tuân theo cấu hình và yêu cầu của người dùng. [Thông báo từ hook](https://code.claude.com/docs/en/hooks#json-output) · [Cách Claude Code chọn subagent](https://code.claude.com/docs/en/sub-agents)

## Quy tắc hiển thị đề xuất

| Điều kiện, xét theo thứ tự | Hành vi của askills |
| --- | --- |
| Tính năng tắt, người dùng gọi slash command, yêu cầu tự làm hoặc nói “đừng chia agent” | Bỏ qua đề xuất chia việc. |
| Người dùng đã yêu cầu rõ một hoặc nhiều subagent | Để Claude Code xử lý lệnh trực tiếp. Không nhắc lại đề xuất hay hỏi xác nhận. |
| Yêu cầu sửa code, chạy test hoặc triển khai thay đổi | Bỏ qua đề xuất review chỉ đọc. |
| Có đích cụ thể và hai kết quả có thể làm độc lập, chẳng hạn review hành vi **và** đối chiếu test | Hiện một đề xuất ngắn cho người dùng, ghi rõ phạm vi từng phần. |
| Review thông thường, chỉ hỏi về test, chưa rõ phạm vi, hoặc phần sau phụ thuộc kết quả phần trước | Claude chính xử lý yêu cầu như hiện tại. |

Số file, số skill được chọn và sự xuất hiện của từ “test” chưa đủ để hiện đề xuất. Ví dụ, `review test này` chỉ có một đối tượng review. Với `tìm nguyên nhân rồi mới xác định test cần viết`, việc chọn test phụ thuộc kết quả điều tra. Một câu xã giao như `ok, cảm ơn` không kích hoạt hành động từ askills.

## Chế độ làm rõ yêu cầu trước khi thực hiện

Trong bản local, người dùng có thể yêu cầu làm rõ theo từng nhiệm vụ bằng câu như `giúp tôi làm rõ yêu cầu này trước`. Với hook đang bật và skill phù hợp trong pool, askills hiển thị gợi ý `requirements-discovery`. Khi chỉ suy ra khả năng còn thiếu quyết định về retry hoặc bản ghi trùng, hook gửi gợi ý đó riêng cho Claude qua `additionalContext`. Claude được hướng dẫn đối chiếu hội thoại và repo trước khi quyết định hỏi. Luồng này hoạt động độc lập với đề xuất chia việc.

| Tình huống | Cách xử lý mong muốn |
| --- | --- |
| Prompt đủ rõ, ví dụ `review @src/core/agent-runner.ts` | Bắt đầu review. |
| Cần biết hệ thống hiện làm gì, ví dụ `runner đang xử lý exit code thế nào?` | Claude tự đối chiếu code và test, trả lời kèm bằng chứng. |
| Có hai cách hiểu dẫn tới hai hành vi khác nhau và repo chưa xác định người dùng muốn cách nào | Hỏi một câu tập trung vào quyết định có tác động lớn nhất. Đưa lựa chọn cụ thể và hệ quả nếu điều đó giúp người dùng trả lời. |
| Người dùng đã chốt hành vi ở lượt trước | Dùng lại quyết định đó. Khi đủ thông tin, tóm tắt ngắn hành vi và tiêu chí kiểm chứng. Tiếp tục theo phạm vi người dùng đã giao. |

Ví dụ, với `thêm retry khi runner lỗi`, Claude có thể tự kiểm tra các nhánh lỗi trong runner. Nếu phạm vi retry còn mở, câu hỏi là **“Bạn muốn thử lại khi tiến trình chưa khởi động được, hay cả khi lệnh đã chạy rồi trả mã lỗi? Trường hợp sau có thể khiến cùng một tác vụ chạy hai lần.”** Nếu người dùng chọn phương án đầu, một tiêu chí kiểm chứng là lệnh đã khởi động rồi thoát với mã lỗi chỉ được chạy một lần. Nếu người dùng đang yêu cầu thiết kế, ghi quyết định vào thiết kế là đủ.

Chấm riêng chế độ này qua bốn tình huống trong bảng, bao gồm một hội thoại nhiều lượt. Với yêu cầu rõ, dữ kiện tra được hoặc quyết định đã chốt, kỳ vọng **0 câu hỏi thừa**. Với yêu cầu có hai cách hiểu quan trọng, câu hỏi phải phân biệt được hai phương án và câu trả lời phải đi vào tiêu chí kiểm chứng. Số lần tạo subagent do chế độ này kích hoạt là **0**.

### Kết quả ban đầu với prompt tự nhiên

Ngoài trường hợp người dùng yêu cầu làm rõ, có hai tình huống đáng thử gợi ý chủ động. Một là thêm retry khi chưa rõ có được chạy lại lệnh đã bắt đầu hay không. Hai là xử lý mã học sinh trùng khi import, nơi cả bỏ qua dòng và cập nhật bản ghi cũ đều giúp quá trình import tiếp tục. Mỗi tình huống có một prompt đối chứng đã chốt hành vi. Các nhãn trong [bộ eval](../eval/clarification.ts) giả định đây là yêu cầu mới và chưa có quyết định trước đó.

Trong checkout askills đã bootstrap với profile `coding`, chạy `npm run eval:clarification -- --report-only`. Lệnh gửi từng prompt tới hook local và đọc tên skill từ `additionalContext`. Hai prompt đối chứng gọi đích danh skill phải hoạt động trước khi chấm. Báo cáo in dấu vân tay của registry để đối chiếu giữa các lần chạy. Bỏ `--report-only` để lệnh trả mã lỗi nếu có ca trượt.

Ngày 24/11/2026, với registry ghim ở `e548c42c`, hook đạt **6/10**. Trong bốn ca cần gợi ý, hook chỉ chọn `requirements-discovery` cho yêu cầu làm rõ bằng tiếng Anh. Trong sáu ca cần bỏ qua, hook bỏ qua đúng năm ca, bao gồm review file bằng tiếng Việt. Ca trượt còn lại chứa cụm `the requirements are settled`: người dùng đã chốt khi nào được retry nhưng hook vẫn gợi ý làm rõ.

Sau khi bổ sung tín hiệu cho yêu cầu làm rõ và hai trường hợp có thể còn thiếu quyết định, cùng registry đạt **10/10 ca ban đầu**. Bộ mở rộng đạt **12/12**. Lượt review implementation theo requirements vẫn nhận gợi ý review. Lượt vừa thông báo requirements đã chốt vừa yêu cầu thiết kế domain model vẫn nhận gợi ý domain modeling. Khi chỉ thông báo requirements đã chốt rồi yêu cầu thực hiện chính sách retry cụ thể, hook không phát gợi ý. Các con số này đo lựa chọn skill của hook local.

### Cách chấm một phiên Claude Code

Chạy cùng phiên bản Claude và cùng snapshot repo ở hai phiên mới, một phiên dùng bộ skill native, một phiên bật thêm gợi ý từ askills. Giữ nguyên skill, prompt và các quyết định được cung cấp cho hai bên. Ghi lại câu hỏi thực tế, quyết định người dùng đã đưa ra và hành vi Claude dùng để kiểm chứng công việc.

| Hội thoại | Điều cần quan sát |
| --- | --- |
| Gửi `retry-open`, rồi trả lời “Chỉ thử lại một lần khi tiến trình chưa khởi động được.” | Tối đa một câu hỏi phân biệt lỗi khởi động với lỗi sau khi chạy. Sau câu trả lời, Claude dùng quyết định đó và đưa ra cách kiểm chứng lệnh đã chạy rồi thoát lỗi chỉ được gọi một lần. |
| Chốt quy tắc retry ngay từ lượt trước, rồi gửi nguyên văn `retry-open` | Claude tiếp tục theo quyết định cũ. Đây là cùng một prompt cuối với ca trên nhưng số câu hỏi cần đặt ở lượt này là 0. |
| Gửi `import-open`, sau đó thử `import-specified` trong phiên mới | Với yêu cầu mở, Claude hỏi về số phận bản ghi trùng nếu repo chưa quy định. Với yêu cầu đã chốt, kết quả phải giữ bản ghi cũ, ghi số dòng và tiếp tục import. |
| Gửi `file-review` hoặc `lookup` | Claude đọc file và trả lời yêu cầu trực tiếp. Đếm riêng bất kỳ câu hỏi nào làm trì hoãn việc review hoặc tra code. |

Chỉ tính là cải thiện trong hội thoại khi phiên có askills giải quyết thêm được một quyết định còn mở và giữ số câu hỏi thừa bằng 0 ở các ca đã rõ. Phép so sánh hội thoại này chưa được chạy.

## Hai vai trò minh họa khi người dùng chủ động giao việc

Đây là mô tả công việc để soạn lời gợi ý và làm thí nghiệm trong project tạm. Hai tên dưới đây là tên thử nghiệm. Bản đề xuất cho người dùng không phụ thuộc việc project đã cài hai agent này.

| Vai trò | Đầu vào và công việc | Đầu ra cho Claude chính |
| --- | --- | --- |
| `askills-reviewer` | Nạp `code-review`. Đọc file hoặc diff được chỉ định và các caller cần thiết. Với runner, theo dõi đường đi từ `runAgent` tới xử lý sự kiện `error` và `exit`. | Với mỗi phát hiện, trả vị trí, hành vi quan sát được, tác động và điều kiện xảy ra. Nêu rõ khi chỉ có giả thuyết. |
| `askills-test-reviewer` | Nạp `verification-before-done`. Đọc contract, test và fixture liên quan để xác định assertion nào thực sự bảo vệ từng hành vi. | Trả cặp hành vi–test với đường dẫn, trường hợp còn thiếu và phạm vi đã đọc. Việc đọc assertion chỉ chứng minh test tồn tại. |

Cả hai vai trò dùng `Read`, `Grep`, `Glob`. Claude chính truyền yêu cầu, phạm vi, các ràng buộc và câu hỏi cụ thể cho từng bên. Với runner, agent thứ hai có thể đối chiếu riêng các trường hợp binary không tồn tại, tiến trình trả mã khác 0 và tiến trình kết thúc bằng signal. Đây là các câu hỏi review, chưa phải kết luận về lỗi.

Claude chính ghép bằng chứng theo hành vi, mở lại vị trí nguồn khi hai kết quả mâu thuẫn và gộp các phát hiện trùng. Một test còn thiếu được trình bày là khoảng trống kiểm chứng. Nếu một agent lỗi hoặc bị hủy, Claude trả phần đã xác minh và ghi rõ phần còn thiếu. Bản đầu không tự thử lại liên tục.

## Bộ eval trước khi viết tính năng

Mỗi ca ghi prompt, phạm vi project và nội dung gợi ý kỳ vọng. Giữ cố định phiên bản registry. Dấu `—` nghĩa là không hiện gợi ý chia việc. Trong mọi ca, số lời gọi subagent do askills khởi tạo phải bằng **0**. [Các ca routing hiện tại](../eval/registry-cases.json)

| Ca | Prompt hoặc điều kiện | Gợi ý hiển thị |
| --- | --- | --- |
| 01 | `review @src/core/agent-runner.ts cho tôi nhé` | — |
| 02 | `review @test/commands.test.ts` | — |
| 03 | `review hai file này giúp tôi`, có hai tham chiếu file | — |
| 04 | `review logic của runner và đối chiếu các test liên quan`, có file đích | Một thông báo nêu hai phần review hành vi và đối chiếu test |
| 05 | `Review the exit behavior and independently map its test coverage`, có file đích | Như ca 04 |
| 06 | Giống ca 04, thêm `đừng chia agent` | — |
| 07 | `dùng một subagent đối chiếu coverage của runner` | —, người dùng đã trực tiếp giao việc |
| 08 | `dùng hai subagent cho hai phần trên` sau ca 04 | —, Claude xử lý yêu cầu trong lượt này |
| 09 | `tìm nguyên nhân rồi mới quyết định test cần viết` | — |
| 10 | `sửa runner rồi chạy test` | — |
| 11 | Gọi trực tiếp `/code-review @src/core/agent-runner.ts` | — |
| 12 | Giống ca 04, tính năng gợi ý chia việc đã tắt | — |
| 13 | Giống ca 04, file đích thuộc package `apps/api` của monorepo | Một thông báo, cả hai phần cùng giới hạn trong scope API |
| 14 | `review logic và đối chiếu test`, chưa có đích mà hook xác định được | — |
| 15 | `ok, cảm ơn`, bỏ qua gợi ý hoặc chuyển sang câu hỏi khác sau ca 04 | Không nhắc lại đề xuất cũ, không phát lệnh giao việc |

### Ba lớp kiểm chứng

1. **Đề xuất.** Tất cả 15 ca phải khớp nội dung, số thông báo và phạm vi kỳ vọng. Ca 04, 05 và 13 phải chạy được với project chưa đăng ký subagent. Tất cả các ca có 0 chỉ thị giao việc trong `additionalContext`, 0 lần askills khởi chạy agent, 0 thay đổi định nghĩa agent.
2. **Phiên chat.** Trong project tạm trên VS Code và Desktop, dùng model giả lập để quan sát riêng thông báo tới người dùng, request tới mô hình và các lời gọi công cụ. Với prompt có đề xuất, mô hình nhận prompt review ban đầu cùng gợi ý skill và trả lời trong cùng lượt dù người dùng không tương tác với thông báo. Với yêu cầu giao việc rõ ràng, kiểm tra Claude nhận nguyên yêu cầu, không có lượt xác nhận do askills chèn thêm. Ghi riêng các lần Claude tự gọi agent có sẵn để quy đúng nguyên nhân. [Sự kiện subagent của Claude Code](https://code.claude.com/docs/en/hooks#subagentstart)
3. **Giá trị của giao việc khi được chọn.** Giữ thiết kế A/B 36 lượt như một thí nghiệm tự nguyện sau đó. Hai bài đơn và bốn bài hai phần, mỗi bài chạy ba lần cho mỗi phương án. A là review trực tiếp. B giữ review trực tiếp cho hai bài đơn, còn ở bốn bài hai phần người thử **chủ động yêu cầu** dùng hai subagent. Giữ cùng model, snapshot, đáp án chấm trước và giới hạn thời gian. Chấm phát hiện có bằng chứng, độ chính xác, tổng token của tất cả agent và thời gian tới bản review cuối.

**Bản chỉ đề xuất đạt yêu cầu khi** 15/15 ca đúng, người dùng bỏ qua gợi ý vẫn nhận được câu trả lời, và không có lần giao việc nào do askills tự khởi tạo. **Với thí nghiệm A/B,** ít nhất 10/12 lượt có yêu cầu giao hai phần trả về được cả hai loại bằng chứng. B tìm thêm ít nhất một vấn đề trong đáp án so với A khi cộng trung bình ba lượt của từng bài hai phần. Tỷ lệ phát hiện đúng không thấp hơn A, median token tối đa 2 lần A và median thời gian tối đa 1,5 lần A. Đây là các ngưỡng đề xuất, chưa phải kết quả đo.

## Thứ tự triển khai sau khi duyệt

1. Chốt 15 ca eval, gồm các trường hợp bỏ qua, từ chối và yêu cầu dùng subagent ngay từ đầu.
2. Thêm gợi ý hiển thị vào hook sau một tùy chọn của project. Kiểm tra bật/tắt, thông báo và hành vi tiếp tục chat trên hai client.
3. Sau khi kiểm chứng chất lượng gợi ý, chạy thí nghiệm A/B trong project tạm nếu muốn đánh giá lợi ích của việc chủ động giao việc.

**Bằng chứng hiện có.** Trong project tạm, bước khởi tạo của Claude Code cho VS Code `2.1.331` và Desktop `2.1.330` đều liệt kê đúng hai vai trò cùng hai skill nêu trên. Chưa có lượt giao việc, kết quả review của subagent hay số đo A/B trong phép thử này.
