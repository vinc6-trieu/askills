# Kế hoạch sửa askills sau review

Ưu tiên đầu tiên là bảo vệ project đang hoạt động khi registry thay đổi. Ba PR dưới đây tương ứng với ba luồng người dùng. Mỗi PR bắt đầu bằng ca tái hiện đang trượt. PR 2 và PR 3 có thể kiểm thử độc lập.

## PR 1 · Cập nhật registry an toàn

**Ca tái hiện.** Project ghim snapshot A và có `global/tdd` trong `skills.pool`. Snapshot B gỡ skill này. Sau `sync`, người dùng làm theo gợi ý `bootstrap --update-lock`. Hiện tại bootstrap thất bại nhưng lock đã trỏ sang B và lần `resolve` tiếp theo cũng lỗi.

- Tách bước chuẩn bị snapshot và lock dự kiến khỏi bước ghi lock. Dùng cùng một snapshot để kiểm tra profile, profile theo đường dẫn, pool, include, exclude, metadata, tên skill và để tạo các liên kết. Hoàn thành kiểm tra trước khi dọn liên kết cũ. Rà cả đường gọi bootstrap từ `prepareAgentTask`. [Bootstrap](../src/commands/bootstrap.ts) · [Registry](../src/core/registry-config.ts) · [Agent task](../src/core/agent-task.ts)
- Chỉ thay lock sau khi liên kết, guide và state đã ghi thành công. Ghi lock qua file tạm cùng thư mục rồi rename. Nếu lỗi giữa chừng, khôi phục phần askills đã thay bằng trạng thái trước đó. Giữ nguyên file và skill do project tự quản lý. [Ghi lock](../src/core/project-lock.ts) · [Liên kết Claude](../src/core/claude-skills.ts)
- Khi so snapshot thấy skill bị gỡ, chỉ ra tham chiếu còn hiệu lực và nơi cần sửa. Nếu profile mới đã bỏ cả skill lẫn tham chiếu, việc cập nhật vẫn hợp lệ. Kiểm tra đường phục hồi vì `askills remove` hiện thêm skill vào `exclude`, và bộ phân giải cũng tra ID đó trong registry. [Báo cáo cập nhật](../src/commands/discover.ts) · [Lệnh remove](../src/commands/skills.ts)

**Nghiệm thu.** Với B thiếu skill còn được yêu cầu, lock giữ nguyên từng byte, liên kết cũ đọc được và `resolve` qua. Với B hợp lệ, lock và liên kết cùng chuyển sang B, chạy lại cho cùng kết quả. Mô phỏng thêm một lỗi ghi sau bước kiểm tra và hai lần cập nhật đồng thời để bắt trạng thái trộn giữa A và B. Nếu project đã gặp lỗi ở bản cũ, kiểm tra đường phục hồi bằng cách khôi phục lock tốt từ Git hoặc bản sao, rồi bootstrap lại từ snapshot đó.

## PR 2 · Tôn trọng ý định trong chat

**Ca tái hiện.** `Đừng dùng TDD, chỉ review @src/core/agent-runner.ts` hiện gợi ý cả TDD. `Dịch câu “làm rõ yêu cầu” sang tiếng Anh` kích hoạt discovery. `Không cần hỏi lại về UI. Hãy giúp tôi làm rõ yêu cầu về quyền xem báo cáo` lại im lặng.

- Viết các cặp eval tiếng Việt và tiếng Anh trước. Phân biệt chỉ thị với câu trích dẫn và gắn phủ định với đúng skill hoặc đúng phần yêu cầu. Áp dụng tín hiệu đó cho lựa chọn tự động trước khi xếp hạng. Giữ hợp đồng CLI hiện có cho `--skill`, `include`, `exclude` và `always`. Với hook chat, đề xuất ẩn skill bị người dùng từ chối ở cả thông báo lẫn ngữ cảnh gửi Claude trong lượt đó. [Resolver](../src/core/skill-resolver.ts) · [Nhận diện yêu cầu](../src/core/requirements-intent.ts) · [Hook](../src/commands/claude-hook.ts)
- Giữ quyết định hỏi ở Claude chính. Trong ca retry, dùng cùng một prompt cuối ở hai hội thoại. Khi phạm vi lỗi còn mở, kỳ vọng một câu hỏi phân biệt hai hành vi. Khi người dùng đã chốt phạm vi ở lượt trước, kỳ vọng Claude tiếp tục ngay và dùng quyết định đó trong tiêu chí kiểm chứng. [Kịch bản hội thoại](claude-subagent-orchestration.md#cách-chấm-một-phiên-claude-code)

**Nghiệm thu.** Câu review chỉ gợi ý các skill phù hợp và vắng TDD, câu dịch vắng `requirements-discovery`, câu về quyền xem vẫn nhận skill này. Yêu cầu review một file tiếp tục trực tiếp. Kiểm tra cả `systemMessage` và `additionalContext`. Chấm chất lượng câu hỏi trên phiên Claude thật riêng với kết quả hook. [Bộ eval hook](../eval/clarification.ts)

## PR 3 · Discovery đúng project và đúng nguồn

- Dùng chung cách tìm `.agent-skills.yaml` gần nhất với hook, dừng ở ranh giới Git. Áp dụng cho cả `discover` và phần gợi ý sau `sync`. Trong một repo thử có profile theo đường dẫn, chạy từ root và từ `src/` phải dùng cùng lock, cùng danh sách skill đang dùng và cùng báo cáo cập nhật project. Kiểm tra thêm repo Git lồng bên trong và thư mục ngoài project. [Lệnh discover](../src/commands/discover.ts) · [Điểm tìm project của hook](../src/commands/claude-hook.ts)
- Tạo ứng viên registry từ descriptor, kể cả khi thiếu `UPSTREAM.json`. Dùng provenance để so phiên bản upstream. Khi registry đã có skill phù hợp cùng tên với kết quả GitHub, ưu tiên tham chiếu registry theo thứ tự cấu hình. Với ứng viên local, hiển thị lệnh `add --pool` và chỉ hiển thị link upstream khi có nguồn. [Danh mục và xếp hạng](../src/core/discovery.ts)

**Nghiệm thu.** Với fixture có `default:languages/typescript` ngoài pool, thiếu provenance và một kết quả GitHub cùng tên, báo cáo đề xuất đúng một lệnh `askills add default:languages/typescript --pool`. Ca này cũng phải qua khi GitHub ngoại tuyến. Skill đã có trong pool hoặc bị exclude tiếp tục được lọc. [Test discovery](../test/discovery.test.ts)

## Kiểm tra trước phát hành

- Chạy build, toàn bộ test, eval routing với fixture và registry ghim, eval theo đường dẫn và eval làm rõ. Đối chiếu riêng ba ca chẩn đoán đã trượt trong lần review: từ vựng tiếng Việt, yêu cầu chỉ viết tài liệu và phủ định test. Ghi kết quả từng ca để biết PR nào thực sự cải thiện hành vi.
- Lockfile đang có đường dẫn theo máy. Trước khi đưa lock vào Git, tạo lại từ URL registry dùng chung, đối chiếu SHA đã duyệt và thử bootstrap rồi resolve với một `ASKILLS_HOME` sạch. Đây là kiểm tra cho lock được chia sẻ; registry đường dẫn local vẫn có ích cho phát triển.
